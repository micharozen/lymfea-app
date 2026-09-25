/**
 * venue-setup — public backend of the venue onboarding wizard (/setup/:token).
 *
 * No user session: every call carries the submission token in the body. The
 * token grants read/write on ONE submission's JSON only (never on business
 * tables). Import into business tables is a separate, super-admin-only RPC
 * (import_venue_setup_submission) triggered from the admin.
 *
 * Actions:
 *   get              → label, status, data, org prefill, signed URLs of files
 *   saveStep         → whitelist-validated merge of one step into data
 *   createUploadUrl  → signed upload URL in the private venue-setup bucket
 *   lookupCompany    → SIREN lookup (recherche-entreprises)
 *   prefillFromWebsite → reads the venue website through llm-agent and fills
 *                      empty answers (max MAX_PREFILLS runs per link)
 *   submit           → draft → submitted, notifies super-admins
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { lookupCompanyBySiren } from "../_shared/companyLookup.ts";
import { safeFetch } from "../_shared/safeFetch.ts";
import {
  applyStep,
  collectFilePaths,
  isOwnFilePath,
  mergePrefill,
  MAX_PREFILLS,
  type PrefillSuggestion,
  MAX_DATA_BYTES,
  MAX_UPLOAD_BYTES,
  UPLOAD_KINDS,
  type SetupData,
  type UploadKind,
} from "../_shared/venueSetup/spec.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "venue-setup";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Submission = {
  id: string;
  organization_id: string;
  label: string;
  data: SetupData;
  status: string;
  expires_at: string;
  submitted_at: string | null;
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

async function loadSubmission(token: unknown): Promise<
  { ok: true; sub: Submission } | { ok: false; res: Response }
> {
  if (typeof token !== "string" || token.length < 32 || token.length > 128) {
    return { ok: false, res: jsonResponse({ error: "invalid_token" }, 401) };
  }
  const { data, error } = await supabaseAdmin
    .from("venue_setup_submissions")
    .select("id, organization_id, label, data, status, expires_at, submitted_at")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    console.error("[venue-setup] load error", error);
    return { ok: false, res: jsonResponse({ error: "load_failed" }, 500) };
  }
  if (!data) return { ok: false, res: jsonResponse({ error: "invalid_token" }, 401) };
  if (new Date(data.expires_at).getTime() < Date.now()) {
    return { ok: false, res: jsonResponse({ error: "expired" }, 410) };
  }
  if (data.status === "archived") {
    return { ok: false, res: jsonResponse({ error: "archived" }, 410) };
  }
  return { ok: true, sub: data as Submission };
}

async function handleGet(sub: Submission): Promise<Response> {
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select(
      "name, commercial_name, legal_name, legal_form, legal_capital, siren, siret, rcs, vat_number, legal_address, legal_postal_code, legal_city, legal_country, contact_email",
    )
    .eq("id", sub.organization_id)
    .maybeSingle();

  const files: Record<string, string> = {};
  const paths = collectFilePaths(sub.data).filter((p) => isOwnFilePath(p, sub.id));
  if (paths.length > 0) {
    const { data: signed } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) files[s.path] = s.signedUrl;
    }
  }

  return jsonResponse({
    label: sub.label,
    status: sub.status,
    submitted_at: sub.submitted_at,
    data: sub.data,
    organization: org ?? null,
    files,
  });
}

async function handleSaveStep(
  sub: Submission,
  body: Record<string, unknown>,
): Promise<Response> {
  if (sub.status !== "draft") return jsonResponse({ error: "locked" }, 409);

  const result = applyStep(sub.data ?? {}, String(body.step ?? ""), body.sections);
  if (result.ok === false) return jsonResponse({ error: "invalid_payload", details: result.error }, 400);

  // File paths must be ones issued for this submission by createUploadUrl.
  const foreign = collectFilePaths(result.data).find((p) => !isOwnFilePath(p, sub.id));
  if (foreign) return jsonResponse({ error: "invalid_payload", details: "file path not allowed" }, 400);

  if (new TextEncoder().encode(JSON.stringify(result.data)).length > MAX_DATA_BYTES) {
    return jsonResponse({ error: "payload_too_large" }, 413);
  }

  // Optimistic guard: only write if still draft (a concurrent submit wins).
  const { data: updated, error } = await supabaseAdmin
    .from("venue_setup_submissions")
    .update({ data: result.data })
    .eq("id", sub.id)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[venue-setup] save error", error);
    return jsonResponse({ error: "save_failed" }, 500);
  }
  if (!updated) return jsonResponse({ error: "locked" }, 409);
  return jsonResponse({ success: true, data: result.data });
}

async function handleCreateUploadUrl(
  sub: Submission,
  body: Record<string, unknown>,
): Promise<Response> {
  if (sub.status !== "draft") return jsonResponse({ error: "locked" }, 409);

  const kind = String(body.kind ?? "") as UploadKind;
  const allowed = UPLOAD_KINDS[kind] as readonly string[] | undefined;
  if (!allowed) return jsonResponse({ error: "invalid_kind" }, 400);

  const contentType = String(body.contentType ?? "");
  const size = Number(body.size);
  if (!allowed.includes(contentType)) return jsonResponse({ error: "invalid_type" }, 400);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
    return jsonResponse({ error: "invalid_size" }, 400);
  }

  const ext = String(body.filename ?? "")
    .toLowerCase()
    .match(/\.([a-z0-9]{2,5})$/)?.[1] ?? "bin";
  const path = `${sub.id}/${kind}-${crypto.randomUUID()}.${ext}`;

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[venue-setup] upload url error", error);
    return jsonResponse({ error: "upload_url_failed" }, 500);
  }
  return jsonResponse({ path, token: data.token, signedUrl: data.signedUrl });
}

const EXT_BY_TYPE: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Downloads the site's og:image into the submission folder, as the cover. */
async function importCover(sub: Submission, imageUrl: string): Promise<string | null> {
  try {
    const img = await safeFetch(imageUrl, MAX_UPLOAD_BYTES);
    const allowed = UPLOAD_KINDS.cover as readonly string[];
    if (!img.ok || !allowed.includes(img.contentType) || img.bytes.length === 0) return null;
    const path = `${sub.id}/cover-${crypto.randomUUID()}.${EXT_BY_TYPE[img.contentType] ?? "jpg"}`;
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, img.bytes, { contentType: img.contentType, upsert: false });
    return error ? null : path;
  } catch {
    return null;
  }
}

// Legal fields taken from the official register rather than the AI reading.
const OFFICIAL_KEYS = [
  "legal_name",
  "legal_form",
  "siren",
  "siret",
  "rcs",
  "vat_number",
  "legal_address",
  "legal_postal_code",
  "legal_city",
  "legal_country",
] as const;

/**
 * When the website's legal notice gives a SIREN/SIRET, completes and corrects
 * the AI's company answers with the official register (recherche-entreprises).
 * Only the suggestion is changed: mergePrefill still never overwrites what
 * the venue typed.
 */
async function withOfficialCompany<T extends PrefillSuggestion>(suggestion: T): Promise<T> {
  const org = suggestion.organization ?? {};
  const digits = (v: unknown) => (typeof v === "string" ? v.replace(/\D/g, "") : "");
  const siren = digits(org.siren).length === 9 ? digits(org.siren) : digits(org.siret).slice(0, 9);
  if (siren.length !== 9) return suggestion;

  const lookup = await lookupCompanyBySiren(siren).catch(() => null);
  if (!lookup || lookup.ok === false) return suggestion;

  const official = Object.fromEntries(
    OFFICIAL_KEYS.map((k) => [k, lookup.company[k]]).filter(([, v]) => v !== null && v !== ""),
  );
  return {
    ...suggestion,
    organization: {
      ...org,
      ...official,
      commercial_name: org.commercial_name ?? lookup.company.commercial_name,
    },
  };
}

async function handlePrefill(sub: Submission, body: Record<string, unknown>): Promise<Response> {
  if (sub.status !== "draft") return jsonResponse({ error: "locked" }, 409);
  const count = sub.data._prefill?.count ?? 0;
  if (count >= MAX_PREFILLS) return jsonResponse({ error: "prefill_limit" }, 429);

  let url = String(body.url ?? "").trim();
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    new URL(url);
  } catch {
    return jsonResponse({ error: "invalid_url" }, 400);
  }

  const { data: extraction, error: llmError } = await supabaseAdmin.functions.invoke("llm-agent", {
    body: { action: "extract-venue-website", url },
  });
  if (llmError || !extraction) {
    const context = (llmError as { context?: Response } | null)?.context;
    const detail = context ? await context.text().catch(() => "") : "";
    console.error("[venue-setup] prefill llm error", llmError?.message, detail.slice(0, 300));
    return jsonResponse({ error: "prefill_failed" }, 502);
  }

  const suggestion = await withOfficialCompany(
    extraction as PrefillSuggestion & { cover_image_url?: string | null },
  );
  const { data, filled } = mergePrefill(sub.data ?? {}, suggestion);

  const hotel = (data.hotel ?? {}) as Record<string, unknown>;
  if (!hotel.cover_image_path && suggestion.cover_image_url) {
    const coverPath = await importCover(sub, suggestion.cover_image_url);
    if (coverPath) {
      data.hotel = { ...hotel, cover_image_path: coverPath };
      filled.push("hotel.cover_image_path");
    }
  }

  data._prefill = { url, at: new Date().toISOString(), count: count + 1, filled };

  const { data: updated, error } = await supabaseAdmin
    .from("venue_setup_submissions")
    .update({ data })
    .eq("id", sub.id)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[venue-setup] prefill save error", error);
    return jsonResponse({ error: "save_failed" }, 500);
  }
  if (!updated) return jsonResponse({ error: "locked" }, 409);
  return jsonResponse({ success: true, filled, data });
}

async function handleSubmit(sub: Submission): Promise<Response> {
  if (sub.status !== "draft") return jsonResponse({ error: "locked" }, 409);

  const hotel = (sub.data.hotel ?? {}) as Record<string, unknown>;
  if (typeof hotel.name !== "string" || !hotel.name.trim()) {
    return jsonResponse({ error: "missing_required", details: "hotel.name" }, 400);
  }

  const { data: updated, error } = await supabaseAdmin
    .from("venue_setup_submissions")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", sub.id)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[venue-setup] submit error", error);
    return jsonResponse({ error: "submit_failed" }, 500);
  }
  if (!updated) return jsonResponse({ error: "locked" }, 409);

  // Notify super-admins in the admin bell. Best effort: the submission is
  // already recorded and listed in /admin/onboarding-requests.
  const { data: superAdmins } = await supabaseAdmin
    .from("admins")
    .select("user_id")
    .eq("is_super_admin", true)
    .not("user_id", "is", null);

  const rows = (superAdmins ?? []).map((a) => ({
    user_id: a.user_id,
    type: "venue_setup_submitted",
    message: `Onboarding soumis : ${hotel.name} (${sub.label})`,
  }));
  if (rows.length > 0) {
    const { error: notifError } = await supabaseAdmin.from("notifications").insert(rows);
    if (notifError) console.error("[venue-setup] notify error", notifError);
  }

  return jsonResponse({ success: true });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const loaded = await loadSubmission(body.token);
    if (!loaded.ok) return loaded.res;
    const { sub } = loaded;

    switch (body.action) {
      case "get":
        return await handleGet(sub);
      case "saveStep":
        return await handleSaveStep(sub, body);
      case "createUploadUrl":
        return await handleCreateUploadUrl(sub, body);
      case "lookupCompany": {
        const lookup = await lookupCompanyBySiren(body.siren);
        if (!lookup.ok) return jsonResponse({ error: lookup.error }, lookup.status);
        return jsonResponse({ success: true, company: lookup.company });
      }
      case "prefillFromWebsite":
        return await handlePrefill(sub, body);
      case "submit":
        return await handleSubmit(sub);
      default:
        return jsonResponse({ error: "unknown_action" }, 400);
    }
  } catch (err) {
    console.error("[venue-setup] error", err);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
