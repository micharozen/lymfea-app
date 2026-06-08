import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgScope, orgScopeKey } from "@/hooks/useOrgScope";

export type EmailInquiryStatus = "received" | "parsed" | "converted" | "dismissed" | "failed";

export interface EmailInquiryParsedTreatmentMatch {
  id: string | null;
  confidence: number;
}

export interface EmailInquiryParsedVariantMatch {
  id: string | null;
  confidence: number;
}

export interface EmailInquiryParsedData {
  client_first_name?: string | null;
  client_last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  requested_date?: string | null;
  requested_time?: string | null;
  treatment_match?: EmailInquiryParsedTreatmentMatch | null;
  variant_match?: EmailInquiryParsedVariantMatch | null;
  guest_count?: number | null;
  notes?: string | null;
  intent_confidence?: number;
  detected_language?: string | null;
}

export interface EmailInquiry {
  id: string;
  hotel_id: string | null;
  from_address: string;
  to_address: string;
  subject: string | null;
  raw_body_text: string | null;
  raw_body_html: string | null;
  parsed_data: EmailInquiryParsedData | null;
  confidence_score: number | null;
  status: EmailInquiryStatus;
  booking_id: string | null;
  error_message: string | null;
  message_id: string | null;
  created_at: string;
  updated_at: string;
  // joined
  hotel?: { id: string; name: string | null } | null;
}

export interface UseEmailInquiriesOptions {
  status?: EmailInquiryStatus | "all";
  hotelId?: string | "all";
  limit?: number;
}

const inboxKeys = {
  all: ["email-inquiries"] as const,
  list: (orgKey: string, opts: UseEmailInquiriesOptions) =>
    [...inboxKeys.all, "org", orgKey, opts] as const,
};

export function useEmailInquiries(opts: UseEmailInquiriesOptions = {}) {
  const scope = useOrgScope();
  const scopeKey = orgScopeKey(scope);

  return useQuery({
    queryKey: inboxKeys.list(scopeKey, opts),
    enabled: scope !== null,
    queryFn: async (): Promise<EmailInquiry[]> => {
      let hotelIds: string[] | null = null;
      if (scope && "organizationId" in scope && scope.organizationId) {
        const { data: hotels, error: hotelsErr } = await supabase
          .from("hotels")
          .select("id")
          .eq("organization_id", scope.organizationId);
        if (hotelsErr) throw hotelsErr;
        hotelIds = (hotels ?? []).map(h => h.id as string);
      }

      let q = supabase
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
          created_at,
          updated_at,
          hotel:hotels(id, name)
        `)
        .order("created_at", { ascending: false })
        .limit(opts.limit ?? 100);

      if (hotelIds !== null) {
        if (hotelIds.length === 0) return [];
        q = q.in("hotel_id", hotelIds);
      }
      if (opts.hotelId && opts.hotelId !== "all") {
        q = q.eq("hotel_id", opts.hotelId);
      }
      if (opts.status && opts.status !== "all") {
        q = q.eq("status", opts.status);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as EmailInquiry[];
    },
    staleTime: 30 * 1000,
  });
}

export function inboxQueryKeys() {
  return inboxKeys;
}
