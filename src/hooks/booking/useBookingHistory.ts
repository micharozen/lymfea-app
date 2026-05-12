import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BookingAuditEntry {
  id: string;
  changed_at: string;
  changed_by: string | null;
  changed_by_name: string | null;
  change_type: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  source: string;
  metadata: Record<string, unknown>;
}

async function resolveUserNames(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};

  const names: Record<string, string> = {};

  // Check admins
  const { data: admins } = await supabase
    .from("admins")
    .select("user_id, first_name, last_name")
    .in("user_id", userIds);
  for (const a of admins ?? []) {
    if (a.user_id) names[a.user_id] = `${a.first_name} ${a.last_name}`;
  }

  // Check concierges for remaining
  const remaining = userIds.filter((id) => !names[id]);
  if (remaining.length > 0) {
    const { data: concierges } = await supabase
      .from("concierges")
      .select("user_id, first_name, last_name")
      .in("user_id", remaining);
    for (const c of concierges ?? []) {
      if (c.user_id) names[c.user_id] = `${c.first_name} ${c.last_name}`;
    }
  }

  // Check therapists for remaining
  const remaining2 = userIds.filter((id) => !names[id]);
  if (remaining2.length > 0) {
    const { data: therapists } = await supabase
      .from("therapists")
      .select("user_id, first_name, last_name")
      .in("user_id", remaining2);
    for (const t of therapists ?? []) {
      if (t.user_id) names[t.user_id] = `${t.first_name} ${t.last_name}`;
    }
  }

  return names;
}

export function useBookingHistory(bookingId: string | undefined, enabled: boolean) {
  return useQuery<BookingAuditEntry[]>({
    queryKey: ["booking-history", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, changed_at, changed_by, change_type, old_values, new_values, source, metadata")
        .eq("table_name", "bookings")
        .eq("record_id", bookingId!)
        .order("changed_at", { ascending: false });

      if (error) throw error;

      const entries = (data ?? []) as unknown as Omit<BookingAuditEntry, "changed_by_name">[];

      // Resolve user names in one batch
      const userIds = [...new Set(entries.map((e) => e.changed_by).filter(Boolean))] as string[];
      const nameMap = await resolveUserNames(userIds);

      return entries.map((entry) => ({
        ...entry,
        changed_by_name: entry.changed_by ? nameMap[entry.changed_by] ?? null : null,
      }));
    },
    enabled: enabled && !!bookingId,
  });
}
