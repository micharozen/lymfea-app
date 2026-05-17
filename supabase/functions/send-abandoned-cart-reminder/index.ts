import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { sendEmail } from "../_shared/send-email.ts";

const SITE_URL = (Deno.env.get("SITE_URL") || "").replace(/\/$/, "");
const RESEND_ABANDONED_CART_TEMPLATE_ID_FR =
  Deno.env.get("RESEND_ABANDONED_CART_TEMPLATE_ID_FR") || "";
const RESEND_ABANDONED_CART_TEMPLATE_ID_EN =
  Deno.env.get("RESEND_ABANDONED_CART_TEMPLATE_ID_EN") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

interface CartItem {
  treatmentId: string;
  variantId?: string | null;
  quantity?: number;
  date?: string;
  time?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();
    if (!token) return jsonResponse({ error: "unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return jsonResponse({ error: "invalid_authentication" }, 401);

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roles) return jsonResponse({ error: "forbidden" }, 403);

    const { abandonedCartId } = await req.json() as { abandonedCartId?: string };
    if (!abandonedCartId) return jsonResponse({ error: "missing_abandonedCartId" }, 400);

    const { data: cart, error: cartError } = await supabase
      .from("abandoned_carts")
      .select(`
        id,
        hotel_id,
        cart_items,
        booking_date,
        booking_time,
        schedule_mode,
        total_price,
        language,
        recovered_at,
        dismissed_at,
        reminder_count,
        customers ( first_name, last_name, email )
      `)
      .eq("id", abandonedCartId)
      .maybeSingle();

    if (cartError || !cart) return jsonResponse({ error: "cart_not_found" }, 404);
    if (cart.recovered_at) return jsonResponse({ error: "already_recovered" }, 409);
    if (cart.dismissed_at) return jsonResponse({ error: "dismissed" }, 409);

    const customer = Array.isArray(cart.customers) ? cart.customers[0] : cart.customers;
    if (!customer?.email) return jsonResponse({ error: "missing_customer_email" }, 400);

    const { data: hotel } = await supabase
      .from("hotels")
      .select("name, slug, currency")
      .eq("id", cart.hotel_id)
      .maybeSingle();

    const items = (cart.cart_items ?? []) as CartItem[];
    const treatmentIds = Array.from(new Set(items.map((i) => i.treatmentId).filter(Boolean)));
    const variantIds = Array.from(new Set(items.map((i) => i.variantId).filter(Boolean) as string[]));

    const [{ data: treatments }, { data: variants }] = await Promise.all([
      treatmentIds.length
        ? supabase.from("treatment_menus").select("id, name").in("id", treatmentIds)
        : Promise.resolve({ data: [] }),
      variantIds.length
        ? supabase.from("treatment_variants").select("id, name").in("id", variantIds)
        : Promise.resolve({ data: [] }),
    ]);

    const treatmentMap = new Map((treatments ?? []).map((t: any) => [t.id, t.name]));
    const variantMap = new Map((variants ?? []).map((v: any) => [v.id, v.name]));

    const lang = (cart.language === "en" ? "en" : "fr") as "fr" | "en";
    const itemsSummary = items
      .map((it) => {
        const base = treatmentMap.get(it.treatmentId) ?? "Soin";
        const variant = it.variantId ? variantMap.get(it.variantId) : null;
        const qty = (it.quantity ?? 1) > 1 ? ` × ${it.quantity}` : "";
        return variant ? `${base} (${variant})${qty}` : `${base}${qty}`;
      })
      .join(", ");

    const slotText = cart.schedule_mode === "per_item"
      ? items
          .filter((i) => i.date && i.time)
          .map((i) => `${i.date} ${(i.time ?? "").substring(0, 5)}`)
          .join(" + ")
      : cart.booking_date && cart.booking_time
        ? `${cart.booking_date} ${cart.booking_time.substring(0, 5)}`
        : "";

    const currencySymbol = hotel?.currency?.toLowerCase() === "eur"
      ? "€"
      : (hotel?.currency || "EUR").toUpperCase();

    const restoreUrl = `${SITE_URL}/client/${hotel?.slug ?? cart.hotel_id}/restore/${cart.id}`;

    const templateId = lang === "fr"
      ? RESEND_ABANDONED_CART_TEMPLATE_ID_FR
      : RESEND_ABANDONED_CART_TEMPLATE_ID_EN;

    if (!templateId) {
      console.error(`Missing Resend template ID for language ${lang}`);
      return jsonResponse({ error: "template_not_configured" }, 500);
    }

    const emailResult = await sendEmail({
      to: customer.email,
      templateId,
      templateVariables: {
        clientFirstName: customer.first_name ?? "",
        clientLastName: customer.last_name ?? "",
        hotelName: hotel?.name ?? "",
        cartSummary: itemsSummary,
        slot: slotText,
        totalPrice: `${cart.total_price}${currencySymbol}`,
        restoreUrl,
      },
    });

    if (emailResult.error) {
      console.error("[ABANDONED-CART-REMINDER] Email error:", emailResult.error);
      return jsonResponse({ error: emailResult.error }, 502);
    }

    const { error: updateError } = await supabase
      .from("abandoned_carts")
      .update({
        reminder_count: (cart.reminder_count ?? 0) + 1,
        last_reminder_at: new Date().toISOString(),
      })
      .eq("id", cart.id);

    if (updateError) {
      console.error("[ABANDONED-CART-REMINDER] Update error:", updateError);
    }

    return jsonResponse({ success: true, emailId: emailResult.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ABANDONED-CART-REMINDER] Global error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
