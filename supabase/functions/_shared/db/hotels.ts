import type { OrgScope, TClient, Database } from "./client.ts";

type HotelRow = Database["public"]["Tables"]["hotels"]["Row"];

export type HotelListItem = HotelRow;

export type HotelListOrder = "name" | "created_at";

export async function listHotelsForOrg(
  client: TClient,
  scope: OrgScope,
  options: { order?: HotelListOrder } = {},
): Promise<HotelListItem[]> {
  const order = options.order ?? "name";
  let q = client.from("hotels").select("*").order(order, { ascending: order !== "created_at" });
  if ("organizationId" in scope && scope.organizationId) {
    q = q.eq("organization_id", scope.organizationId);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as HotelListItem[];
}

// Slim projection for dropdowns that don't need the full row.
export type HotelDropdownItem = Pick<
  HotelRow,
  | "id"
  | "name"
  | "image"
  | "currency"
  | "timezone"
  | "opening_time"
  | "closing_time"
  | "calendar_color"
>;

export async function listHotelsForOrgDropdown(
  client: TClient,
  scope: OrgScope,
): Promise<HotelDropdownItem[]> {
  let q = client
    .from("hotels")
    .select("id, name, image, currency, timezone, opening_time, closing_time, calendar_color")
    .order("name");
  if ("organizationId" in scope && scope.organizationId) {
    q = q.eq("organization_id", scope.organizationId);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as HotelDropdownItem[];
}
