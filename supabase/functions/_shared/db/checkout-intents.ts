import type { OrgScope, TClient } from "./client.ts";
import { resolveHotelIdsForOrg } from "./scope.ts";

/**
 * Shape written by the client flow into `checkout_intents.cart_snapshot`
 * (see src/pages/client/GuestInfo.tsx). The column is typed `Json`, and old
 * rows may predate any given field — everything is optional and parsed
 * defensively by `parseCartSnapshot`.
 */
export interface CartSnapshotItem {
  treatmentId?: string;
  name?: string;
  quantity?: number;
  variantId?: string | null;
  variantLabel?: string | null;
  guestCount?: number;
  price?: number | null;
  isPriceOnRequest?: boolean;
  isBundle?: boolean;
}

export interface CartSnapshot {
  items: CartSnapshotItem[];
  total: number | null;
  currency: string;
  itemCount: number;
  scheduleMode: string | null;
}

export interface CheckoutIntentRow {
  id: string;
  hotel_id: string;
  client_first_name: string;
  client_last_name: string | null;
  client_email: string;
  language: string;
  room_number: string | null;
  booking_date: string | null;
  booking_time: string | null;
  cart_snapshot: unknown;
  converted_at: string | null;
  booking_id: string | null;
  reminder_count: number;
  reminder_sent_at: string | null;
  created_at: string;
  hotels: { id: string; name: string } | null;
}

const SELECT_COLUMNS =
  "id, hotel_id, client_first_name, client_last_name, client_email, language, room_number, " +
  "booking_date, booking_time, cart_snapshot, converted_at, booking_id, reminder_count, " +
  "reminder_sent_at, created_at, hotels ( id, name )";

export async function listCheckoutIntentsForOrg(
  client: TClient,
  scope: OrgScope,
  options: { sinceDays?: number } = {},
): Promise<CheckoutIntentRow[]> {
  const hotelIds = await resolveHotelIdsForOrg(client, scope);

  let q = client
    .from("checkout_intents")
    .select(SELECT_COLUMNS)
    .order("created_at", { ascending: false });

  if (hotelIds !== null) {
    if (hotelIds.length === 0) return [];
    q = q.in("hotel_id", hotelIds);
  }

  if (options.sinceDays) {
    const since = new Date(Date.now() - options.sinceDays * 24 * 60 * 60 * 1000);
    q = q.gte("created_at", since.toISOString());
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as CheckoutIntentRow[];
}

/** Never throws: a malformed snapshot must not take the admin page down. */
export function parseCartSnapshot(raw: unknown): CartSnapshot {
  const empty: CartSnapshot = { items: [], total: null, currency: "EUR", itemCount: 0, scheduleMode: null };
  if (!raw || typeof raw !== "object") return empty;

  const snapshot = raw as Record<string, unknown>;
  const items = Array.isArray(snapshot.items)
    ? (snapshot.items.filter((i) => i && typeof i === "object") as CartSnapshotItem[])
    : [];

  return {
    items,
    total: typeof snapshot.total === "number" ? snapshot.total : null,
    currency: typeof snapshot.currency === "string" ? snapshot.currency : "EUR",
    itemCount:
      typeof snapshot.itemCount === "number"
        ? snapshot.itemCount
        : items.reduce((sum, i) => sum + (i.quantity ?? 1), 0),
    scheduleMode: typeof snapshot.scheduleMode === "string" ? snapshot.scheduleMode : null,
  };
}

/**
 * Maps each reminded intent id to the `audit_log` row holding the sent email,
 * so the admin page can offer the same "preview" button as a booking history.
 */
export async function fetchReminderAuditIds(
  client: TClient,
  intentIds: string[],
): Promise<Record<string, string>> {
  if (intentIds.length === 0) return {};

  const { data, error } = await client
    .from("audit_log")
    .select("id, record_id, new_values")
    .eq("table_name", "checkout_intents")
    .in("record_id", intentIds)
    .order("changed_at", { ascending: false });

  if (error) throw error;

  const byIntent: Record<string, string> = {};
  for (const row of (data ?? []) as Array<{ id: string; record_id: string; new_values: unknown }>) {
    if (byIntent[row.record_id]) continue;
    const values = (row.new_values ?? {}) as Record<string, unknown>;
    if (values.action === "email_sent" && values.has_preview === true) {
      byIntent[row.record_id] = row.id;
    }
  }
  return byIntent;
}

export const checkoutIntentKeys = {
  all: ["checkout-intents"] as const,
  list: (orgKey: string, sinceDays: number | null) =>
    [...checkoutIntentKeys.all, "org", orgKey, "list", sinceDays ?? "all"] as const,
};
