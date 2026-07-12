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

/** Resolve treatment_rooms.id (UUID) → room name for room_id values in the audit log. */
async function resolveRoomNames(roomIds: string[]): Promise<Record<string, string>> {
  if (roomIds.length === 0) return {};

  const { data } = await supabase
    .from("treatment_rooms")
    .select("id, name")
    .in("id", roomIds);

  const names: Record<string, string> = {};
  for (const r of data ?? []) {
    if (r.id) names[r.id] = r.name;
  }
  return names;
}

/**
 * The audit trigger stores `therapist_name` next to `therapist_id`, but it can be
 * null if the booking's name column wasn't populated at change time. Backfill the
 * name from the therapists table so the history never shows a raw UUID.
 */
function backfillNames(
  vals: Record<string, unknown> | null,
  therapistNames: Record<string, string>,
  roomNames: Record<string, string>,
): Record<string, unknown> | null {
  if (!vals) return vals;

  let result = vals;

  const therapistId = vals.therapist_id;
  if (typeof therapistId === "string" && therapistId && !vals.therapist_name) {
    const resolved = therapistNames[therapistId];
    if (resolved) result = { ...result, therapist_name: resolved };
  }

  const roomId = vals.room_id;
  if (typeof roomId === "string" && roomId && !vals.room_name) {
    const resolved = roomNames[roomId];
    if (resolved) result = { ...result, room_name: resolved };
  }

  return result;
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

      // Collect therapist and room UUIDs that lack a resolved name in the audit values
      const therapistIds = new Set<string>();
      const roomIds = new Set<string>();
      for (const e of entries) {
        for (const vals of [e.old_values, e.new_values]) {
          const therapistId = vals?.therapist_id;
          if (typeof therapistId === "string" && therapistId && !vals?.therapist_name) {
            therapistIds.add(therapistId);
          }
          const roomId = vals?.room_id;
          if (typeof roomId === "string" && roomId && !vals?.room_name) {
            roomIds.add(roomId);
          }
        }
      }

      const [nameMap, therapistNames, roomNames] = await Promise.all([
        resolveUserNames(userIds),
        resolveTherapistNames([...therapistIds]),
        resolveRoomNames([...roomIds]),
      ]);

      return entries.map((entry) => ({
        ...entry,
        old_values: backfillNames(entry.old_values, therapistNames, roomNames),
        new_values: backfillNames(entry.new_values, therapistNames, roomNames),
        changed_by_name: entry.changed_by ? nameMap[entry.changed_by] ?? null : null,
      }));
    },
    enabled: enabled && !!bookingId,
  });
}
