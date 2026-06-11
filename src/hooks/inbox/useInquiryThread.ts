import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { EmailInquiry } from "./useEmailInquiries";

// Fetches the conversation for an inquiry: the root inbound row plus every
// outbound reply (parent_inquiry_id = rootId), ordered chronologically.
export function useInquiryThread(rootInquiryId: string | null | undefined) {
  return useQuery({
    queryKey: ["email-inquiry-thread", rootInquiryId],
    enabled: Boolean(rootInquiryId),
    staleTime: 30 * 1000,
    queryFn: async (): Promise<EmailInquiry[]> => {
      const { data, error } = await supabase
        .from("email_inquiries" as never)
        .select(`
          id,
          hotel_id,
          from_address,
          to_address,
          subject,
          raw_body_text,
          raw_body_html,
          parsed_data,
          confidence_score,
          status,
          booking_id,
          error_message,
          message_id,
          direction,
          parent_inquiry_id,
          sent_by,
          last_reply_at,
          created_at,
          updated_at
        `)
        .or(`id.eq.${rootInquiryId},parent_inquiry_id.eq.${rootInquiryId}`)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as EmailInquiry[];
    },
  });
}
