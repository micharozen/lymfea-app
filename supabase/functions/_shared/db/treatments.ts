import type { OrgScope, TClient, Database } from "./client.ts";
import { resolveHotelIdsForOrg } from "./scope.ts";

type TreatmentMenuRow = Database["public"]["Tables"]["treatment_menus"]["Row"];

export async function listTreatmentMenusForOrg(
  client: TClient,
  scope: OrgScope,
  options: { includeNullHotel?: boolean } = {},
): Promise<TreatmentMenuRow[]> {
  const hotelIds = await resolveHotelIdsForOrg(client, scope);
  let q = client
    .from("treatment_menus")
    .select("*")
    .order("sort_order", { ascending: true, nullsFirst: true })
    .order("name");

  if (hotelIds !== null) {
    if (options.includeNullHotel) {
      const idsCsv = hotelIds.length > 0 ? hotelIds.join(",") : "";
      q = q.or(
        hotelIds.length > 0
          ? `hotel_id.in.(${idsCsv}),hotel_id.is.null`
          : `hotel_id.is.null`,
      );
    } else {
      if (hotelIds.length === 0) return [];
      q = q.in("hotel_id", hotelIds);
    }
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as TreatmentMenuRow[];
}

// Active treatments available for booking at a specific hotel.
// Includes hotel-less (global) treatments via includeNullHotel=true.
export async function listActiveTreatmentsForHotel(
  client: TClient,
  hotelId: string,
): Promise<TreatmentMenuRow[]> {
  const { data, error } = await client
    .from("treatment_menus")
    .select("*")
    .or(`hotel_id.eq.${hotelId},hotel_id.is.null`)
    .in("status", ["active", "Actif", "Active"])
    .order("sort_order", { ascending: true, nullsFirst: true })
    .order("name");
  if (error) throw error;
  return (data ?? []) as TreatmentMenuRow[];
}
