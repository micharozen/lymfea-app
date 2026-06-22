import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";

/**
 * Lazily fetch the rendered HTML body of a single sent email (audit_log row).
 *
 * Raw-HTML emails store the body locally (`email_html`) → returned directly.
 * Template emails only store `resend_email_id` → the body is fetched on demand
 * from Resend via the `get-email-html` edge function.
 *
 * Kept out of `useBookingHistory` so the history list query stays lightweight —
 * the body is only loaded when the user opens a preview.
 */
export function useEmailHtml(auditId: string | null, enabled: boolean) {
  return useQuery<string | null>({
    queryKey: ["email-html", auditId],
    queryFn: async () => {
      // `email_html` / `resend_email_id` added by migrations 20260622130000 /
      // 20260622140000 — cast until types.ts is regenerated.
      const { data, error } = await supabase
        .from("audit_log")
        .select("email_html, resend_email_id")
        .eq("id", auditId!)
        .single();

      if (error) throw error;

      const row = data as unknown as {
        email_html: string | null;
        resend_email_id: string | null;
      } | null;

      // Fast path: HTML stored locally.
      if (row?.email_html) return row.email_html;

      // Template email: fetch the rendered body from Resend.
      if (row?.resend_email_id) {
        const { data: fnData, error: fnError } = await invokeEdgeFunction<
          { auditId: string },
          { html: string | null }
        >("get-email-html", { body: { auditId: auditId! } });
        if (fnError) throw fnError;
        return fnData?.html ?? null;
      }

      return null;
    },
    enabled: enabled && !!auditId,
    staleTime: Infinity,
  });
}
