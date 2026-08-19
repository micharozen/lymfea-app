import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Indique si un email de confirmation a déjà été envoyé pour ce booking, en
 * lisant les traces laissées par `_shared/send-email.ts` dans `audit_log`
 * (`change_type = 'action'`, `new_values.action = 'email_sent'`).
 *
 * `booking_confirmed` = notify-booking-confirmed (passage en confirmé),
 * `booking_confirmation` = send-booking-confirmation (flux legacy / Stripe).
 */
const CONFIRMATION_EMAIL_TYPES = ["booking_confirmed", "booking_confirmation"];

export interface ConfirmationEmailStatus {
  alreadySent: boolean;
  lastSentAt: string | null;
}

export function useConfirmationEmailSent(bookingId: string | undefined, enabled = true) {
  return useQuery<ConfirmationEmailStatus>({
    queryKey: ["booking-confirmation-email-sent", bookingId],
    enabled: Boolean(bookingId) && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, changed_at")
        .eq("table_name", "bookings")
        .eq("record_id", bookingId!)
        .eq("change_type", "action")
        .eq("new_values->>action", "email_sent")
        .in("new_values->>email_type", CONFIRMATION_EMAIL_TYPES)
        .order("changed_at", { ascending: false })
        .limit(1);

      if (error) throw error;

      const last = data?.[0];
      return { alreadySent: Boolean(last), lastSentAt: last?.changed_at ?? null };
    },
  });
}
