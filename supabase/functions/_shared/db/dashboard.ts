import type { OrgScope, TClient, Database } from "./client.ts";
import { resolveHotelIdsForOrg } from "./scope.ts";

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];
type HotelRow = Database["public"]["Tables"]["hotels"]["Row"];

// ── Types ───────────────────────────────────────────────────────────
//
// Chaque requête a son propre type de ligne : elles ne lisent ni la même
// fenêtre ni les mêmes colonnes. La règle du hook qui les consomme est qu'une
// métrique dérive d'exactement UNE de ces sources — elles se recouvrent dans
// le temps (la période courante et le carnet futur partagent aujourd'hui),
// donc les concaténer produirait des doubles comptages.

export type DashboardHotel = Pick<
  HotelRow,
  "id" | "name" | "currency" | "opening_time" | "closing_time"
>;

export type DashboardRoom = {
  id: string;
  hotel_id: string | null;
  name: string | null;
  capacity: number | null;
};

/** Réservations de la période affichée + période précédente (tendances). */
export type PeriodBooking = Pick<
  BookingRow,
  | "id"
  | "booking_date"
  | "booking_time"
  | "total_price"
  | "hotel_id"
  | "hotel_name"
  | "status"
  | "payment_status"
  | "therapist_id"
  | "therapist_name"
  | "client_type"
  | "source"
> & {
  booking_treatments: Array<{ treatment_menus: { name: string | null } | null }>;
};

/** Carnet à venir : aujourd'hui inclus, jusqu'à un an. Sans jointure. */
export type UpcomingBooking = Pick<
  BookingRow,
  | "id"
  | "booking_id"
  | "booking_date"
  | "booking_time"
  | "total_price"
  | "hotel_id"
  | "hotel_name"
  | "status"
  | "payment_status"
  | "room_id"
  | "room_number"
  | "client_type"
  | "duration"
  | "guest_count"
>;

/** Réservations *créées* dans la période, quelle que soit leur date de soin. */
export type LeadTimeBooking = Pick<
  BookingRow,
  "created_at" | "booking_date" | "hotel_id"
> & {
  booking_treatments: Array<{ treatment_menus: { name: string | null } | null }>;
};

/** Réservations en attente ou en échec de paiement, sur toute la fenêtre. */
export type PaymentAlertBooking = Pick<
  BookingRow,
  | "id"
  | "booking_id"
  | "booking_date"
  | "booking_time"
  | "total_price"
  | "hotel_id"
  | "hotel_name"
  | "status"
  | "payment_status"
>;

export type DashboardReference = {
  hotels: DashboardHotel[];
  treatmentRooms: DashboardRoom[];
  therapistVenues: Array<{ therapist_id: string; hotel_id: string }>;
  todayAvailableTherapistIds: string[];
};

/** Une ligne d'agrégat mensuel renvoyée par get_dashboard_monthly_outlook. */
export type OutlookAggregateRow = {
  monthKey: string;
  hotelId: string;
  bucket: "pending" | "confirmed";
  /** Montant dans la devise du lieu — la conversion EUR est faite côté client. */
  revenue: number;
  bookingCount: number;
};

/** Fenêtre de dates (ISO YYYY-MM-DD). */
export type DateWindow = { fromDate: string; toDate: string };

/** Plafond de lignes de PostgREST : une réponse plus longue est tronquée en silence. */
const POSTGREST_PAGE_SIZE = 1000;

/** Colonnes des jointures de soins — le nom sert aux classements et au lead time. */
const TREATMENTS_JOIN = "booking_treatments(treatment_menus(name))";

// ── Q0 — scope → hotel_ids ──────────────────────────────────────────
//
// Résolu une fois et mis en cache, au lieu d'être un aller-retour bloquant
// répété à chaque lecture. Null = pas de restriction (super-admin).

export function fetchScopedHotelIds(
  client: TClient,
  scope: OrgScope,
): Promise<string[] | null> {
  return resolveHotelIdsForOrg(client, scope);
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Lit toutes les pages d'une requête paginée. Au-delà du plafond PostgREST,
 * une page pleine ne signifie pas la fin des données, elle signifie qu'il en
 * reste.
 */
async function fetchAllPages<T>(
  page: (offset: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += POSTGREST_PAGE_SIZE) {
    const { data, error } = await page(offset);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < POSTGREST_PAGE_SIZE) return rows;
  }
}

/** Réservations vides ⇒ requête inutile : un scope sans lieu ne peut rien avoir. */
const isEmptyScope = (hotelIds: string[] | null): boolean =>
  hotelIds !== null && hotelIds.length === 0;

// ── Q1 — référentiel ────────────────────────────────────────────────
//
// Ne dépend d'aucune réservation : c'est ce qui permet d'afficher tout de
// suite le sélecteur de lieu, la carte « thérapeutes actifs » et le bon
// nombre de lignes du heatmap, avant même que les réservations n'arrivent.

export async function fetchDashboardReference(
  client: TClient,
  hotelIds: string[] | null,
  today: string,
): Promise<DashboardReference> {
  if (isEmptyScope(hotelIds)) {
    return { hotels: [], treatmentRooms: [], therapistVenues: [], todayAvailableTherapistIds: [] };
  }

  let hotelsQ = client
    .from("hotels")
    .select("id, name, currency, opening_time, closing_time")
    .order("created_at", { ascending: false });
  let roomsQ = client
    .from("treatment_rooms")
    .select("id, hotel_id, name, capacity")
    .in("status", ["active", "Actif"]);
  let venuesQ = client.from("therapist_venues").select("therapist_id, hotel_id");

  if (hotelIds !== null) {
    hotelsQ = hotelsQ.in("id", hotelIds);
    roomsQ = roomsQ.in("hotel_id", hotelIds);
    venuesQ = venuesQ.in("hotel_id", hotelIds);
  }

  const availabilityQ = client
    .from("therapist_availability")
    .select("therapist_id")
    .eq("date", today)
    .eq("is_available", true);

  const [hotelsRes, roomsRes, venuesRes, availabilityRes] = await Promise.all([
    hotelsQ,
    roomsQ,
    venuesQ,
    availabilityQ,
  ]);

  if (hotelsRes.error) throw hotelsRes.error;
  if (roomsRes.error) throw roomsRes.error;
  if (venuesRes.error) throw venuesRes.error;
  if (availabilityRes.error) throw availabilityRes.error;

  const therapistVenues = (venuesRes.data ?? []) as Array<{
    therapist_id: string;
    hotel_id: string;
  }>;

  // Défense en profondeur : therapist_availability n'a pas de colonne lieu, on
  // restreint aux thérapeutes rattachés à un lieu du scope.
  let availableIds = ((availabilityRes.data ?? []) as Array<{ therapist_id: string }>).map(
    (r) => r.therapist_id,
  );
  if (hotelIds !== null) {
    const scopedTherapistIds = new Set(therapistVenues.map((v) => v.therapist_id));
    availableIds = availableIds.filter((id) => scopedTherapistIds.has(id));
  }

  return {
    hotels: (hotelsRes.data ?? []) as DashboardHotel[],
    treatmentRooms: (roomsRes.data ?? []) as DashboardRoom[],
    therapistVenues,
    todayAvailableTherapistIds: availableIds,
  };
}

// ── Q2 — réservations de la période ─────────────────────────────────
//
// La fenêtre couvre la période affichée ET la période précédente, celle-ci
// servant au calcul des tendances. C'est la seule requête volumineuse, et la
// seule (avec Q5) à porter la jointure sur les soins.

export function fetchPeriodBookings(
  client: TClient,
  hotelIds: string[] | null,
  window: DateWindow,
): Promise<PeriodBooking[]> {
  if (isEmptyScope(hotelIds)) return Promise.resolve([]);

  return fetchAllPages<PeriodBooking>((offset) => {
    const q = client
      .from("bookings")
      .select(
        `id, booking_date, booking_time, total_price, hotel_id, hotel_name, status, payment_status, therapist_id, therapist_name, client_type, source, ${TREATMENTS_JOIN}`,
      )
      .gte("booking_date", window.fromDate)
      .lte("booking_date", window.toDate)
      .order("booking_date", { ascending: true })
      // Départage stable : sans ça, une même ligne peut apparaître dans deux lots.
      .order("id", { ascending: true })
      .range(offset, offset + POSTGREST_PAGE_SIZE - 1);
    return hotelIds !== null ? q.in("hotel_id", hotelIds) : q;
  });
}

// ── Q3 — carnet à venir ─────────────────────────────────────────────
//
// D'aujourd'hui jusqu'à un an : alimente les compteurs du jour, l'occupation
// des salles, la prévision à 7 jours et les réservations sans thérapeute.
// Pas de jointure sur les soins — aucune de ces métriques n'en a besoin.

export function fetchUpcomingBookings(
  client: TClient,
  hotelIds: string[] | null,
  window: DateWindow,
): Promise<UpcomingBooking[]> {
  if (isEmptyScope(hotelIds)) return Promise.resolve([]);

  return fetchAllPages<UpcomingBooking>((offset) => {
    const q = client
      .from("bookings")
      .select(
        "id, booking_id, booking_date, booking_time, total_price, hotel_id, hotel_name, status, payment_status, room_id, room_number, client_type, duration, guest_count",
      )
      .gte("booking_date", window.fromDate)
      .lte("booking_date", window.toDate)
      .order("booking_date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + POSTGREST_PAGE_SIZE - 1);
    return hotelIds !== null ? q.in("hotel_id", hotelIds) : q;
  });
}

// ── Q4 — agrégat mensuel (RPC) ──────────────────────────────────────
//
// Le graphe mensuel n'a besoin que de sommes par (mois × lieu × statut) :
// Postgres les calcule, on ne transfère plus les lignes.

export async function fetchMonthlyOutlook(
  client: TClient,
  hotelIds: string[] | null,
  window: DateWindow,
): Promise<OutlookAggregateRow[]> {
  if (isEmptyScope(hotelIds)) return [];

  // Cast : la fonction est créée par 20260908090000_dashboard_monthly_outlook,
  // elle n'apparaîtra dans les types générés qu'après le prochain
  // `supabase gen types`.
  const { data, error } = await (client.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>)("get_dashboard_monthly_outlook", {
    _hotel_ids: hotelIds,
    _from_month: window.fromDate,
    _to_month: window.toDate,
  });
  if (error) throw error;

  // PostgREST sérialise `numeric` en chaîne : sans Number(), les sommes
  // deviendraient des concaténations.
  return ((data ?? []) as Array<{
    month_key: string;
    hotel_id: string;
    bucket: string;
    revenue: number | string;
    booking_count: number;
  }>).map((r) => ({
    monthKey: r.month_key,
    hotelId: r.hotel_id,
    bucket: r.bucket === "pending" ? "pending" : "confirmed",
    revenue: Number(r.revenue) || 0,
    bookingCount: Number(r.booking_count) || 0,
  }));
}

// ── Q5 — délai d'anticipation ───────────────────────────────────────
//
// Filtré sur created_at (réservations FAITES dans la période) et sans borne
// sur booking_date : une réservation prise hier pour dans un an est
// précisément ce que la métrique mesure.

export function fetchLeadTimeBookings(
  client: TClient,
  hotelIds: string[] | null,
  window: DateWindow,
): Promise<LeadTimeBooking[]> {
  if (isEmptyScope(hotelIds)) return Promise.resolve([]);

  return fetchAllPages<LeadTimeBooking>((offset) => {
    const q = client
      .from("bookings")
      .select(`created_at, booking_date, hotel_id, ${TREATMENTS_JOIN}`)
      // Borne haute exclusive au lendemain : created_at est un timestamp, un
      // lte sur la date seule couperait la dernière journée à minuit.
      .gte("created_at", window.fromDate)
      .lt("created_at", window.toDate)
      .order("created_at", { ascending: true })
      .range(offset, offset + POSTGREST_PAGE_SIZE - 1);
    return hotelIds !== null ? q.in("hotel_id", hotelIds) : q;
  });
}

// ── Q6 — alertes de paiement ────────────────────────────────────────
//
// Le filtre payment_status étant appliqué par Postgres, la fenêtre large ne
// coûte rien : on préserve le périmètre historique des alertes.

export function fetchPaymentAlerts(
  client: TClient,
  hotelIds: string[] | null,
  window: DateWindow,
): Promise<PaymentAlertBooking[]> {
  if (isEmptyScope(hotelIds)) return Promise.resolve([]);

  return fetchAllPages<PaymentAlertBooking>((offset) => {
    const q = client
      .from("bookings")
      .select(
        "id, booking_id, booking_date, booking_time, total_price, hotel_id, hotel_name, status, payment_status",
      )
      .in("payment_status", ["pending", "failed"])
      .gte("booking_date", window.fromDate)
      .lte("booking_date", window.toDate)
      .order("booking_date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + POSTGREST_PAGE_SIZE - 1);
    return hotelIds !== null ? q.in("hotel_id", hotelIds) : q;
  });
}
