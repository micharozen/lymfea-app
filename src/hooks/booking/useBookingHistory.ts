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

/** Resolve therapists.id (UUID) → "First Last" for therapist_id values in the audit log. */
async function resolveTherapistNames(therapistIds: string[]): Promise<Record<string, string>> {
  if (therapistIds.length === 0) return {};

  const { data } = await supabase
    .from("therapists")
    .select("id, first_name, last_name")
    .in("id", therapistIds);

  const names: Record<string, string> = {};
  for (const t of data ?? []) {
    if (t.id) names[t.id] = `${t.first_name} ${t.last_name}`.trim();
  }
  return names;
}

/**
 * The audit trigger stores `therapist_name` next to `therapist_id`, but it can be
 * null if the booking's name column wasn't populated at change time. Backfill the
 * name from the therapists table so the history never shows a raw UUID.
 */
function backfillTherapistName(
  vals: Record<string, unknown> | null,
  names: Record<string, string>,
): Record<string, unknown> | null {
  if (!vals) return vals;
  const id = vals.therapist_id;
  if (typeof id !== "string" || !id || vals.therapist_name) return vals;
  const resolved = names[id];
  return resolved ? { ...vals, therapist_name: resolved } : vals;
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

      // Collect therapist UUIDs that lack a resolved name in the audit values
      const therapistIds = new Set<string>();
      for (const e of entries) {
        for (const vals of [e.old_values, e.new_values]) {
          const id = vals?.therapist_id;
          if (typeof id === "string" && id && !vals?.therapist_name) therapistIds.add(id);
        }
      }

      const [nameMap, therapistNames] = await Promise.all([
        resolveUserNames(userIds),
        resolveTherapistNames([...therapistIds]),
      ]);

      return entries.map((entry) => ({
        ...entry,
        old_values: backfillTherapistName(entry.old_values, therapistNames),
        new_values: backfillTherapistName(entry.new_values, therapistNames),
        changed_by_name: entry.changed_by ? nameMap[entry.changed_by] ?? null : null,
      }));
    },
    enabled: enabled && !!bookingId,
  });
}
