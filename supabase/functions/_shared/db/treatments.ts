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
    .select("*, treatment_variants(id, label, duration, price, is_default, guest_count, available_days)")
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
    .select("*, treatment_variants(id, label, duration, price, is_default, guest_count, available_days)")
    .or(`hotel_id.eq.${hotelId},hotel_id.is.null`)
    .in("status", ["active", "Actif", "Active"])
    .order("sort_order", { ascending: true, nullsFirst: true })
    .order("name");
  if (error) throw error;
  return (data ?? []) as TreatmentMenuRow[];
}

/**
 * Noms distincts des prestations de l'organisation, pour alimenter le filtre
 * "prestation" de la liste des réservations. Dédupliqués : un même soin proposé
 * dans plusieurs lieux ne doit pas apparaître plusieurs fois.
 */
export async function listTreatmentNamesForOrg(
  client: TClient,
  scope: OrgScope,
): Promise<string[]> {
  const hotelIds = await resolveHotelIdsForOrg(client, scope);
  let q = client.from("treatment_menus").select("name").order("name");
  if (hotelIds !== null) {
    if (hotelIds.length === 0) return [];
    q = q.in("hotel_id", hotelIds);
  }
  const { data, error } = await q;
  if (error) throw error;
  const names = (data ?? [])
    .map((row) => (row as { name: string | null }).name)
    .filter((name): name is string => !!name);
  return [...new Set(names)];
}
