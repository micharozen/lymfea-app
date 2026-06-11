import type { ActionContext } from "../index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function slugify(input: string): string {
  const normalized = input.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

async function findFreeSlug(
  supabase: ActionContext["supabase"],
  base: string,
): Promise<string> {
  if (!base) base = "org";
  let candidate = base;
  for (let i = 0; i < 10; i++) {
    const { data } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
    const suffix = Math.random().toString(36).slice(2, 6);
    candidate = `${base}-${suffix}`.slice(0, 60);
  }
  // Last resort
  return `${base}-${Date.now().toString(36)}`.slice(0, 60);
}

export async function handleCompleteOrganizationSignup(
  ctx: ActionContext,
): Promise<Response> {
  const organizationName = String(ctx.body.organization_name ?? "").trim();
  const firstName = String(ctx.body.first_name ?? "").trim();
  const lastName = String(ctx.body.last_name ?? "").trim();
  const phone = String(ctx.body.phone ?? "").trim();
  const email = ctx.userEmail;

  if (!organizationName || organizationName.length < 2) {
    return json({ error: "organization_name is required (min 2 chars)" }, 400);
  }
  if (!firstName) return json({ error: "first_name is required" }, 400);
  if (!lastName) return json({ error: "last_name is required" }, 400);
  if (phone && phone.length < 6) {
    return json({ error: "phone must be at least 6 chars" }, 400);
  }
  if (!email) {
    return json({ error: "Authenticated user has no email" }, 400);
  }

  // Idempotence: if this user already has an admins row, return its org.
  const { data: existingAdmin } = await ctx.supabase
    .from("admins")
    .select("organization_id, organizations:organization_id(slug)")
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (existingAdmin?.organization_id) {
    const slug = (existingAdmin.organizations as { slug?: string } | null)?.slug ?? "";
    return json({
      organization_id: existingAdmin.organization_id,
      organization_slug: slug,
      already_existed: true,
    });
  }

  // Anti-spam: refuse if an organization already exists for this contact_email
  // (the case where the user is already linked is covered above).
  const { data: dupOrg } = await ctx.supabase
    .from("organizations")
    .select("id")
    .eq("contact_email", email)
    .maybeSingle();
  if (dupOrg) {
    return json(
      { error: "An organization already exists for this email" },
      409,
    );
  }

  // Resolve a free slug.
  const baseSlug = slugify(organizationName) || "org";
  const slug = await findFreeSlug(ctx.supabase, baseSlug);

  // 1. Create organization.
  const { data: org, error: orgErr } = await ctx.supabase
    .from("organizations")
    .insert({
      name: organizationName,
      slug,
      contact_email: email,
    })
    .select("id, slug")
    .single();
  if (orgErr || !org) {
    return json(
      { error: orgErr?.message ?? "Failed to create organization" },
      500,
    );
  }

  // 2. user_roles row (upsert in case it already exists from a previous attempt).
  const { error: roleErr } = await ctx.supabase
    .from("user_roles")
    .upsert(
      { user_id: ctx.userId, role: "admin" },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );
  if (roleErr) {
    // Compensating: drop the org we just created so the user can retry.
    await ctx.supabase.from("organizations").delete().eq("id", org.id);
    return json({ error: `Failed to assign role: ${roleErr.message}` }, 500);
  }

  // 3. admins row with profile fields (all NOT NULL).
  const { error: adminErr } = await ctx.supabase.from("admins").insert({
    user_id: ctx.userId,
    organization_id: org.id,
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    is_super_admin: false,
    status: "active",
  });
  if (adminErr) {
    await ctx.supabase.from("organizations").delete().eq("id", org.id);
    return json({ error: `Failed to create admin: ${adminErr.message}` }, 500);
  }

  // 4. Seed the org's gateway API key (used to call api.saoma.io/v1/*).
  // Best-effort: a failure here must not block onboarding — the admin can
  // regenerate from /admin/api-keys later.
  const { error: apiKeyErr } = await ctx.supabase.rpc(
    "gateway_create_org_api_key",
    { _org_id: org.id },
  );
  if (apiKeyErr) {
    console.error("gateway_create_org_api_key failed:", apiKeyErr);
  }

  return json({ organization_id: org.id, organization_slug: org.slug });
}
