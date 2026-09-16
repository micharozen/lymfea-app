import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgScope, orgScopeKey } from "@/hooks/useOrgScope";

export type ChannelMessageStatus =
  | "received"
  | "parsed"
  | "converted"
  | "dismissed"
  | "failed"
  | "replied"
  | "sent";

export type ChannelMessageDirection = "inbound" | "outbound";

export interface ChannelMessageParsedTreatmentMatch {
  id: string | null;
  confidence: number;
}

export interface ChannelMessageParsedTreatmentCandidate {
  id: string | null;
  confidence: number;
  reason?: string | null;
}

export interface ChannelMessageParsedVariantMatch {
  id: string | null;
  confidence: number;
}

export interface ChannelMessageParsedData {
  client_first_name?: string | null;
  client_last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  requested_date?: string | null;
  requested_time?: string | null;
  treatment_match?: ChannelMessageParsedTreatmentMatch | null;
  treatment_candidates?: ChannelMessageParsedTreatmentCandidate[] | null;
  variant_match?: ChannelMessageParsedVariantMatch | null;
  guest_count?: number | null;
  notes?: string | null;
  intent_confidence?: number;
  detected_language?: string | null;
}

export interface ChannelMessage {
  id: string;
  hotel_id: string | null;
  from_identifier: string;
  to_identifier: string;
  subject: string | null;
  raw_body_text: string | null;
  raw_body_html: string | null;
  parsed_data: ChannelMessageParsedData | null;
  confidence_score: number | null;
  status: ChannelMessageStatus;
  booking_id: string | null;
  error_message: string | null;
  external_message_id: string | null;
  direction: ChannelMessageDirection;
  parent_message_id: string | null;
  /** Tâche qui traite ce fil — le suivi du travail vit sur tasks. */
  task_id: string | null;
  channel: string;
  sent_by: string | null;
  last_reply_at: string | null;
  created_at: string;
  updated_at: string;
  // joined
  hotel?: { id: string; name: string | null } | null;
}

export interface UseChannelMessagesOptions {
  status?: ChannelMessageStatus | "all";
  hotelId?: string | "all";
  limit?: number;
}

const inboxKeys = {
  all: ["email-inquiries"] as const,
  list: (orgKey: string, opts: UseChannelMessagesOptions) =>
    [...inboxKeys.all, "org", orgKey, opts] as const,
};

export function useChannelMessages(opts: UseChannelMessagesOptions = {}) {
  const scope = useOrgScope();
  const scopeKey = orgScopeKey(scope);

  return useQuery({
    queryKey: inboxKeys.list(scopeKey, opts),
    enabled: scope !== null,
    queryFn: async (): Promise<ChannelMessage[]> => {
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
        .from("channel_messages" as never)
        .select(`
          id,
          hotel_id,
          from_identifier,
          to_identifier,
          subject,
          raw_body_text,
          raw_body_html,
          parsed_data,
          confidence_score,
          status,
          booking_id,
          error_message,
          external_message_id,
          direction,
          parent_message_id,
          task_id,
          channel,
          sent_by,
          last_reply_at,
          created_at,
          updated_at,
          hotel:hotels(id, name)
        `)
        .eq("direction", "inbound")
        .is("parent_message_id", null)
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
      return (data ?? []) as unknown as ChannelMessage[];
    },
    staleTime: 30 * 1000,
  });
}

export function inboxQueryKeys() {
  return inboxKeys;
}
