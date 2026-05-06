// Admin-only edge function that upserts a venue's payment provider config.
// Sensitive credentials are written to Supabase Vault (never to a public table);
// the table only stores the Vault secret UUID + non-sensitive metadata.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Provider = "none" | "stripe" | "adyen";

interface RequestBody {
  hotelId: string;
  provider: Provider;
  // Non-sensitive fields written directly to the table
  publicFields?: {
    stripe_publishable_key?: string | null;
    stripe_account_id?: string | null;
    adyen_merchant_account?: string | null;
    adyen_environment?: "test" | "live" | null;
    adyen_client_key?: string | null;
  };
  // Sensitive fields routed through Vault. Omit a field to keep the existing
  // value; pass an empty string to clear.
  secrets?: {
    stripe_secret_key?: string;
    stripe_webhook_secret?: string;
    adyen_api_key?: string;
    adyen_hmac_key?: string;
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const parts = token.split(".");
    if (parts.length !== 3) return jsonResponse({ error: "Invalid token" }, 401);

    let payload: { sub?: string };
    try {
      payload = JSON.parse(atob(parts[1]));
    } catch {
      return jsonResponse({ error: "Invalid token payload" }, 401);
    }

    const userId = payload.sub;
    if (!userId) return jsonResponse({ error: "Invalid auth" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: roleRow, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !roleRow) {
      return jsonResponse({ error: "Forbidden — admin role required" }, 403);
    }

    const body = (await req.json()) as RequestBody;
    const { hotelId, provider, publicFields = {}, secrets = {} } = body;

    if (!hotelId) return jsonResponse({ error: "hotelId is required" }, 400);
    if (!["none", "stripe", "adyen"].includes(provider)) {
      return jsonResponse({ error: `Invalid provider: ${provider}` }, 400);
    }

    // Provider = "none" → wipe config entirely (including Vault secrets)
    if (provider === "none") {
      const { data: existing } = await supabase
        .from("hotel_payment_configs")
        .select("stripe_vault_secret_id, adyen_vault_secret_id")
        .eq("hotel_id", hotelId)
        .maybeSingle();

      if (existing?.stripe_vault_secret_id) {
        await supabase.rpc("delete_payment_secret", {
          p_secret_id: existing.stripe_vault_secret_id,
        });
      }
      if (existing?.adyen_vault_secret_id) {
        await supabase.rpc("delete_payment_secret", {
          p_secret_id: existing.adyen_vault_secret_id,
        });
      }

      await supabase
        .from("hotel_payment_configs")
        .delete()
        .eq("hotel_id", hotelId);

      await supabase
        .from("hotels")
        .update({ payment_provider: null })
        .eq("id", hotelId);

      return jsonResponse({ success: true });
    }

    // Read existing row to merge secrets and capture current Vault UUID
    const { data: existingRow } = await supabase
      .from("hotel_payment_configs")
      .select("stripe_vault_secret_id, adyen_vault_secret_id")
      .eq("hotel_id", hotelId)
      .maybeSingle();

    const updateRow: Record<string, unknown> = {
      hotel_id: hotelId,
      provider,
      updated_at: new Date().toISOString(),
    };

    if (provider === "stripe") {
      if ("stripe_publishable_key" in publicFields)
        updateRow.stripe_publishable_key = publicFields.stripe_publishable_key ?? null;
      if ("stripe_account_id" in publicFields)
        updateRow.stripe_account_id = publicFields.stripe_account_id ?? null;

      const hasNewSecret =
        secrets.stripe_secret_key !== undefined ||
        secrets.stripe_webhook_secret !== undefined;

      if (hasNewSecret) {
        // Merge with existing secret payload so partial updates don't wipe other fields
        let existingPayload: Record<string, string | null> = {};
        if (existingRow?.stripe_vault_secret_id) {
          const { data: current } = await supabase.rpc(
            "get_payment_stripe_secrets",
            { p_hotel_id: hotelId },
          );
          if (current && typeof current === "object") {
            existingPayload = current as Record<string, string | null>;
          }
        }

        const merged = {
          stripe_secret_key:
            secrets.stripe_secret_key !== undefined
              ? secrets.stripe_secret_key || null
              : existingPayload.stripe_secret_key ?? null,
          stripe_webhook_secret:
            secrets.stripe_webhook_secret !== undefined
              ? secrets.stripe_webhook_secret || null
              : existingPayload.stripe_webhook_secret ?? null,
        };

        const { data: secretId, error: vaultError } = await supabase.rpc(
          "upsert_payment_secret",
          {
            p_hotel_id: hotelId,
            p_provider: "stripe",
            p_payload: merged,
            p_existing_id: existingRow?.stripe_vault_secret_id ?? null,
          },
        );

        if (vaultError) {
          console.error("[payment-config-upsert] Vault upsert failed:", vaultError);
          return jsonResponse({ error: "Failed to store credentials" }, 500);
        }
        updateRow.stripe_vault_secret_id = secretId;
      }
    }

    if (provider === "adyen") {
      if ("adyen_merchant_account" in publicFields)
        updateRow.adyen_merchant_account = publicFields.adyen_merchant_account ?? null;
      if ("adyen_environment" in publicFields)
        updateRow.adyen_environment = publicFields.adyen_environment ?? "test";
      if ("adyen_client_key" in publicFields)
        updateRow.adyen_client_key = publicFields.adyen_client_key ?? null;

      const hasNewSecret =
        secrets.adyen_api_key !== undefined ||
        secrets.adyen_hmac_key !== undefined;

      if (hasNewSecret) {
        let existingPayload: Record<string, string | null> = {};
        if (existingRow?.adyen_vault_secret_id) {
          const { data: current } = await supabase.rpc(
            "get_payment_adyen_secrets",
            { p_hotel_id: hotelId },
          );
          if (current && typeof current === "object") {
            existingPayload = current as Record<string, string | null>;
          }
        }

        const merged = {
          adyen_api_key:
            secrets.adyen_api_key !== undefined
              ? secrets.adyen_api_key || null
              : existingPayload.adyen_api_key ?? null,
          adyen_hmac_key:
            secrets.adyen_hmac_key !== undefined
              ? secrets.adyen_hmac_key || null
              : existingPayload.adyen_hmac_key ?? null,
        };

        const { data: secretId, error: vaultError } = await supabase.rpc(
          "upsert_payment_secret",
          {
            p_hotel_id: hotelId,
            p_provider: "adyen",
            p_payload: merged,
            p_existing_id: existingRow?.adyen_vault_secret_id ?? null,
          },
        );

        if (vaultError) {
          console.error("[payment-config-upsert] Vault upsert failed:", vaultError);
          return jsonResponse({ error: "Failed to store credentials" }, 500);
        }
        updateRow.adyen_vault_secret_id = secretId;
      }
    }

    const { error: upsertError } = await supabase
      .from("hotel_payment_configs")
      .upsert(updateRow, { onConflict: "hotel_id" });

    if (upsertError) {
      console.error("[payment-config-upsert] Row upsert failed:", upsertError);
      return jsonResponse({ error: "Failed to save config" }, 500);
    }

    await supabase
      .from("hotels")
      .update({ payment_provider: provider })
      .eq("id", hotelId);

    return jsonResponse({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[payment-config-upsert] Error:", err);
    return jsonResponse({ error: message }, 500);
  }
});
