import type { OrgScope, TClient, Database } from "./client.ts";
import { resolveHotelIdsForOrg } from "./scope.ts";

type TreatmentRoomRow = Database["public"]["Tables"]["treatment_rooms"]["Row"];

export async function listTreatmentRoomsForOrg(
  client: TClient,
  scope: OrgScope,
): Promise<TreatmentRoomRow[]> {
  const hotelIds = await resolveHotelIdsForOrg(client, scope);
  if (hotelIds !== null && hotelIds.length === 0) return [];

  let q = client.from("treatment_rooms").select("*").order("created_at", { ascending: false });
  if (hotelIds !== null) {
    q = q.in("hotel_id", hotelIds);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as TreatmentRoomRow[];
}

export type TreatmentRoomDropdownItem = Pick<
  TreatmentRoomRow,
  "id" | "name" | "room_number" | "image" | "hotel_id"
>;

export async function listTreatmentRoomsForOrgDropdown(
  client: TClient,
  scope: OrgScope,
): Promise<TreatmentRoomDropdownItem[]> {
  const hotelIds = await resolveHotelIdsForOrg(client, scope);
  if (hotelIds !== null && hotelIds.length === 0) return [];

  let q = client
    .from("treatment_rooms")
    .select("id, name, room_number, image, hotel_id")
    .order("name");
  if (hotelIds !== null) {
    q = q.in("hotel_id", hotelIds);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as TreatmentRoomDropdownItem[];
}
