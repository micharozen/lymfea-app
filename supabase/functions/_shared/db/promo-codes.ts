import type { OrgScope, TClient, Database } from "./client.ts";

type PromoCodeRow = Database["public"]["Tables"]["promo_codes"]["Row"];

/** Un code promo avec son assiette et ses métriques d'usage. */
export interface PromoCodeWithStats extends PromoCodeRow {
  treatment_ids: string[];
  redemptions: number;
  total_discount_cents: number;
  last_redeemed_at: string | null;
}

/**
 * Les codes promo sont scopés par organisation, pas par lieu : un code à
 * hotel_id NULL vaut pour tous les lieux et doit rester visible. Le filtrage se
 * fait donc sur organization_id, sans passer par resolveHotelIdsForOrg.
 */
export async function listPromoCodesForOrg(
  client: TClient,
  scope: OrgScope,
): Promise<PromoCodeWithStats[]> {
  let q = client
    .from("promo_codes")
    .select(
      "id, organization_id, hotel_id, code, code_normalized, discount_type, discount_value, valid_from, valid_until, max_redemptions, redemption_count, is_active, description, created_by, created_at, updated_at, promo_code_treatments(treatment_id)",
    )
    .order("created_at", { ascending: false });

  if (!("allOrganizations" in scope && scope.allOrganizations)) {
    q = q.eq("organization_id", (scope as { organizationId: string }).organizationId);
  }

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as (PromoCodeRow & {
    promo_code_treatments: { treatment_id: string }[] | null;
  })[];
  if (rows.length === 0) return [];

  // Agrégat côté serveur : additionner les usages ligne à ligne buterait sur le
  // plafond de 1000 lignes de PostgREST.
  const { data: stats, error: statsError } = await client.rpc("get_promo_code_stats", {
    _promo_code_ids: rows.map((r) => r.id),
  });
  if (statsError) throw statsError;

  type PromoStatRow = {
    promo_code_id: string;
    redemptions: number;
    total_discount_cents: number;
    last_redeemed_at: string | null;
  };
  const statsById = new Map<string, PromoStatRow>(
    ((stats ?? []) as PromoStatRow[]).map((s) => [s.promo_code_id, s]),
  );

  return rows.map((row) => {
    const { promo_code_treatments, ...rest } = row;
    const stat = statsById.get(row.id);
    return {
      ...rest,
      treatment_ids: (promo_code_treatments ?? []).map((t) => t.treatment_id),
      redemptions: Number(stat?.redemptions ?? 0),
      total_discount_cents: Number(stat?.total_discount_cents ?? 0),
      last_redeemed_at: stat?.last_redeemed_at ?? null,
    };
  });
}

export interface PromoRedemptionDetail {
  id: string;
  redeemed_at: string;
  discount_amount_cents: number;
  hotel_id: string | null;
  booking: {
    id: string;
    booking_id: number | null;
    booking_date: string | null;
    booking_time: string | null;
    total_price: number | null;
    client_first_name: string | null;
    client_last_name: string | null;
  } | null;
}

/** Détail des réservations ayant consommé un code, pour le drawer du backoffice. */
export async function listPromoCodeRedemptions(
  client: TClient,
  promoCodeId: string,
  limit = 100,
): Promise<PromoRedemptionDetail[]> {
  const { data, error } = await client
    .from("promo_code_redemptions")
    .select(
      "id, redeemed_at, discount_amount_cents, hotel_id, booking:bookings(id, booking_id, booking_date, booking_time, total_price, client_first_name, client_last_name)",
    )
    .eq("promo_code_id", promoCodeId)
    .order("redeemed_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as PromoRedemptionDetail[];
}
