import type { OrgScope, TClient, Database } from "./client.ts";
import { resolveTreatmentPrice } from "../treatmentPrice.ts";

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

export type BookingTreatment = {
  id?: string;
  /** booking_treatments row id — needed to target a specific line (e.g. set its therapist). */
  bookingTreatmentId?: string;
  treatment_id?: string;
  /** Stable soin↔therapist link. NULL/undefined = fall back to positional mapping. */
  therapist_id?: string | null;
  /** A supplement hanging off a base soin — never one of the guests' soins. */
  is_addon?: boolean;
  /** The booking_treatments row of the soin this add-on extends (its leg). */
  parent_booking_treatment_id?: string | null;
  /** true = accès à une commodité (amenity_id non null) : ni salle ni thérapeute. */
  is_amenity?: boolean;
  /** Type de la commodité liée (piscine, sauna…) — null si ce n'est pas un accès. */
  amenity_type?: string | null;
  /** Nom de la commodité liée — null si ce n'est pas un accès. */
  amenity_name?: string | null;
  name: string;
  duration: number | null;
  price: number | null;
};

/**
 * Colonnes volumineuses jamais lues par la liste ni le planning :
 * `client_signature` est une data-URL d'image (~47 Ko en moyenne, 300 Ko au
 * pire), `client_form_data` et `payment_error_details` du JSON libre. Elles
 * sont exclues du select de liste et ne remontent que sur la fiche (getBookingById).
 */
type HeavyBookingColumn = "client_signature" | "client_form_data" | "payment_error_details";

export type BookingListItem = Omit<BookingRow, HeavyBookingColumn> &
  // Absentes des lignes de liste, présentes sur la fiche : optionnelles pour
  // que le typage dise la vérité des deux côtés.
  Partial<Pick<BookingRow, HeavyBookingColumn>> & {
  totalDuration: number;
  treatmentsTotalDuration: number;
  treatmentsTotalPrice: number;
  treatments: BookingTreatment[];
  room_name: string | null;
  // Name of the optional secondary room of a split duo booking (NULL = single room).
  secondary_room_name: string | null;
  // Full display names of all accepted therapists for a duo booking (incl. primary).
  // Resolved client-side in useBookingData (booking_therapists has no FK to therapists).
  therapist_display_names?: string[];
  booking_therapists?: { status: string; therapist_id: string }[];
  booking_payment_infos?: { payment_status: string | null; stripe_payment_method_id: string | null } | null;
  // Note persistante du client (customers.health_notes), remontée pour l'affichage
  // sur la fiche booking. NULL si pas de client lié ou pas de note.
  customer_health_notes: string | null;
};

export type BookingListFilters = {
  hotelIds?: string[];
  fromDate?: string;
  toDate?: string;
  statuses?: string[];
  therapistIds?: string[];
  /** Modes de paiement ; la sentinelle PAYMENT_METHOD_UNSET vise payment_method IS NULL. */
  paymentMethods?: string[];
  paymentStatuses?: string[];
  /** Recherche plein texte : nom, prénom, téléphone, et n° de réservation si numérique. */
  search?: string;
};

/**
 * Clés de tri poussées à Postgres. Pas de tri sur les prestations : leur libellé
 * vient d'une table jointe, PostgREST ne sait pas trier le parent dessus.
 */
export type BookingSortKey =
  | "reservation"
  | "date"
  | "time"
  | "duration"
  | "status"
  | "payment"
  | "client"
  | "total"
  | "location"
  | "therapist";

export type BookingListSort = {
  key: BookingSortKey;
  direction: "asc" | "desc";
};

// Colonnes réelles derrière chaque clé de tri. `location` s'appuie sur la
// colonne dénormalisée hotel_name (PostgREST ne trie pas sur un embed) : les
// lignes sans nom de lieu atterrissent en fin de liste.
const SORT_COLUMNS: Record<BookingSortKey, string[]> = {
  reservation: ["booking_id"],
  date: ["booking_date", "booking_time"],
  time: ["booking_time"],
  duration: ["duration"],
  status: ["status"],
  payment: ["payment_status"],
  client: ["client_last_name", "client_first_name"],
  total: ["total_price"],
  location: ["hotel_name"],
  therapist: ["therapist_name"],
};

/** Sentinelle « mode de paiement non renseigné ». Doit rester alignée sur src/lib/paymentMethod.ts. */
const PAYMENT_METHOD_UNSET = "unset";

/**
 * Neutralise les caractères qui ont un sens dans la grammaire des filtres
 * PostgREST (`or=(...)`) : sans ça, une virgule tapée dans la recherche casse
 * la requête entière.
 */
function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[,()"\\%*]/g, " ").trim();
}

type RawBookingRow = BookingRow & {
  booking_treatments?: Array<{
    id: string;
    treatment_id: string | null;
    therapist_id: string | null;
    is_addon: boolean | null;
    parent_booking_treatment_id: string | null;
    variant_id: string | null;
    price_override: number | null;
    treatment_menus: {
      name: string | null;
      duration: number | null;
      price: number | null;
      amenity_id: string | null;
      venue_amenities: { type: string | null; name: string | null } | null;
    } | null;
    treatment_variants: {
      id: string;
      label: string | null;
      duration: number | null;
      price: number | null;
    } | null;
  }> | null;
  booking_payment_infos?:
    | { payment_status: string | null; stripe_payment_method_id: string | null }
    | Array<{ payment_status: string | null; stripe_payment_method_id: string | null }>
    | null;
  treatment_rooms?: { name: string | null } | null;
  secondary_room?: { name: string | null } | null;
  customers?: { health_notes: string | null } | null;
};

function computeBookingItem(row: RawBookingRow): BookingListItem {
  const treatmentsJoin = row.booking_treatments ?? [];

  // Amenity lines (pool/sauna access) occupy their own block, not the soin slot —
  // exclude them so the booking's soin duration is not inflated. Mirrors
  // computeSlotDuration server-side.
  const durationOf = (t: NonNullable<RawBookingRow["booking_treatments"]>[number]) =>
    t.treatment_variants?.duration ?? t.treatment_menus?.duration ?? 0;
  const soinLines = treatmentsJoin.filter((t) => t.treatment_menus?.amenity_id == null);

  // Solo: soins run sequentially → sum. Duo: one leg per guest running in
  // parallel → the longest leg wins (an add-on extends its parent's leg, an
  // orphan add-on stacks on top). Mirrors computeSlotDuration server-side so the
  // planning block matches the real occupied slot.
  let treatmentsTotalDuration: number;
  if ((row.guest_count ?? 1) <= 1) {
    treatmentsTotalDuration = soinLines.reduce((sum, t) => sum + durationOf(t), 0);
  } else {
    const legDurations = new Map<string, number>();
    for (const t of soinLines) {
      if (!t.is_addon) legDurations.set(t.id, durationOf(t));
    }
    let orphanDuration = 0;
    for (const t of soinLines) {
      if (!t.is_addon) continue;
      const parentId = t.parent_booking_treatment_id;
      if (parentId && legDurations.has(parentId)) {
        legDurations.set(parentId, legDurations.get(parentId)! + durationOf(t));
      } else {
        orphanDuration += durationOf(t);
      }
    }
    treatmentsTotalDuration = Math.max(0, ...legDurations.values()) + orphanDuration;
  }
  const treatmentsTotalPrice = treatmentsJoin.reduce(
    (sum, t) => sum + resolveTreatmentPrice(t),
    0,
  );
  const totalDuration =
    row.duration && row.duration > 0 ? row.duration : treatmentsTotalDuration;

  const treatments: BookingTreatment[] = treatmentsJoin
    .filter((t) => t.treatment_menus !== null)
    .map((t) => {
      const variant = t.treatment_variants ?? null;
      const variantSuffix = variant?.label ? ` · ${variant.label}` : "";
      return {
        id: t.treatment_id ?? undefined,
        bookingTreatmentId: t.id,
        treatment_id: t.treatment_id ?? undefined,
        therapist_id: t.therapist_id ?? null,
        is_addon: t.is_addon ?? false,
        parent_booking_treatment_id: t.parent_booking_treatment_id ?? null,
        is_amenity: t.treatment_menus!.amenity_id != null,
        amenity_type: t.treatment_menus!.venue_amenities?.type ?? null,
        amenity_name: t.treatment_menus!.venue_amenities?.name ?? null,
        name: (t.treatment_menus!.name ?? "") + variantSuffix,
        duration: variant?.duration ?? t.treatment_menus!.duration,
        price: resolveTreatmentPrice(t),
      };
    });

  const paymentInfos = Array.isArray(row.booking_payment_infos)
    ? row.booking_payment_infos[0] ?? null
    : row.booking_payment_infos ?? null;

  const {
    booking_treatments: _drop,
    booking_payment_infos: _pi,
    treatment_rooms: roomJoin,
    secondary_room: secondaryRoomJoin,
    customers: customerJoin,
    ...booking
  } = row;
  return {
    ...(booking as BookingRow),
    totalDuration,
    treatmentsTotalDuration,
    treatmentsTotalPrice,
    treatments,
    room_name: roomJoin?.name ?? null,
    secondary_room_name: secondaryRoomJoin?.name ?? null,
    booking_payment_infos: paymentInfos,
    customer_health_notes: customerJoin?.health_notes ?? null,
  };
}

// Colonnes de bookings remontées par la liste et le planning : tout sauf les
// colonnes lourdes (cf. HeavyBookingColumn). Énumérées explicitement pour que
// l'ajout d'une future colonne volumineuse soit un choix, pas un effet de bord.
const BOOKING_LIST_COLUMNS = [
  "id",
  "booking_id",
  "booking_date",
  "booking_time",
  "booking_group_id",
  "assigned_at",
  "broadcast_wave",
  "broadcast_wave_sent_at",
  "bundle_usage_id",
  "cancellation_reason",
  "client_email",
  "client_first_name",
  "client_last_name",
  "client_note",
  "client_type",
  "created_at",
  "customer_id",
  "declined_by",
  "duration",
  "email_inquiry_id",
  "external_id",
  "external_reference",
  "gift_amount_applied_cents",
  "guest_count",
  "hold_expires_at",
  "hotel_id",
  "hotel_name",
  "is_out_of_hours",
  "language",
  "payment_error_code",
  "payment_error_message",
  "payment_link_channels",
  "payment_link_language",
  "payment_link_sent_at",
  "payment_link_url",
  "payment_method",
  "payment_reference",
  "payment_status",
  "phone",
  "pms_charge_id",
  "pms_charge_status",
  "pms_error_message",
  "pms_guest_check_in",
  "pms_guest_check_out",
  "quote_token",
  "room_id",
  "room_number",
  "secondary_room_id",
  "short_token",
  "signature_token",
  "signed_at",
  "source",
  "status",
  "stripe_invoice_url",
  "surcharge_amount",
  "therapist_checked_in_at",
  "therapist_gender_preference",
  "therapist_id",
  "therapist_name",
  "total_price",
  "updated_at",
].join(", ");

// Jointures partagées par listBookings et getBookingById. Gardées identiques
// pour qu'une réservation rendue depuis le cache de liste et une réservation
// chargée par id aient la même forme.
// NB : la jointure du filtre d'org (`hotels!inner(id, organization_id)`) n'est
// ajoutée que par listBookings — getBookingById cherche par PK et s'appuie sur RLS.
const BOOKING_EMBEDS = `
      booking_treatments(
        id,
        treatment_id,
        therapist_id,
        is_addon,
        parent_booking_treatment_id,
        variant_id,
        price_override,
        treatment_menus(name, duration, price, amenity_id, venue_amenities(type, name)),
        treatment_variants(id, label, duration, price)
      ),
      booking_therapists(status, therapist_id),
      booking_payment_infos(payment_status, stripe_payment_method_id),
      treatment_rooms!room_id(name),
      secondary_room:treatment_rooms!secondary_room_id(name),
      customers(health_notes)`;

/** Fiche : toutes les colonnes, y compris signature et formulaire de santé. */
const BOOKING_SELECT = `*,${BOOKING_EMBEDS}`;

/** Liste et planning : colonnes utiles seulement. */
const BOOKING_LIST_SELECT = `${BOOKING_LIST_COLUMNS},${BOOKING_EMBEDS}`;

/**
 * Fetch a single booking by its primary key, with the same nested shape as
 * listBookings. No org filter: `id` is the PK and RLS already scopes access, so
 * this is the fastest possible lookup (used by the detail page instead of
 * loading the whole org's list to `.find()` one row).
 */
export async function getBookingById(
  client: TClient,
  id: string,
): Promise<BookingListItem | null> {
  const { data, error } = await client
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return computeBookingItem(data as RawBookingRow);
}

/**
 * Applique le scope d'organisation et les filtres à une requête bookings déjà
 * construite. Partagé par la liste bornée par dates (planning) et la liste
 * paginée (/admin/bookings), pour que les deux filtrent exactement pareil.
 */
// Le type du builder PostgREST dépend du select et du comptage demandés ; on le
// traite comme opaque plutôt que de le reproduire à l'identique dans chaque appelant.
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BookingQuery = any;

function applyBookingFilters(
  query: BookingQuery,
  scope: OrgScope,
  filters: BookingListFilters,
): BookingQuery {
  let q = query;

  if ("organizationId" in scope && scope.organizationId) {
    q = q.eq("hotels.organization_id", scope.organizationId);
  }
  if (filters.hotelIds?.length) q = q.in("hotel_id", filters.hotelIds);
  if (filters.fromDate) q = q.gte("booking_date", filters.fromDate);
  if (filters.toDate) q = q.lte("booking_date", filters.toDate);
  if (filters.statuses?.length) q = q.in("status", filters.statuses);
  if (filters.therapistIds?.length) q = q.in("therapist_id", filters.therapistIds);
  if (filters.paymentStatuses?.length) q = q.in("payment_status", filters.paymentStatuses);

  if (filters.paymentMethods?.length) {
    const methods = filters.paymentMethods.filter((m) => m !== PAYMENT_METHOD_UNSET);
    const wantsUnset = filters.paymentMethods.includes(PAYMENT_METHOD_UNSET);
    if (wantsUnset && methods.length) {
      q = q.or(`payment_method.is.null,payment_method.in.(${methods.join(",")})`);
    } else if (wantsUnset) {
      q = q.is("payment_method", null);
    } else {
      q = q.in("payment_method", methods);
    }
  }

  const search = filters.search ? sanitizeSearchTerm(filters.search) : "";
  if (search) {
    const conditions = [
      `client_first_name.ilike.%${search}%`,
      `client_last_name.ilike.%${search}%`,
      `phone.ilike.%${search}%`,
    ];
    // booking_id est un integer : un ilike dessus fait échouer toute la requête
    // (42883). On ne l'interroge donc qu'en égalité, et seulement si la saisie
    // est bien un numéro.
    if (/^\d+$/.test(search)) conditions.push(`booking_id.eq.${search}`);
    q = q.or(conditions.join(","));
  }

  return q;
}

// Retire la jointure hotels, ajoutée uniquement pour le filtre d'organisation.
function toListItem(row: unknown): BookingListItem {
  const { hotels: _hotels, ...rest } = row as RawBookingRow & { hotels?: unknown };
  return computeBookingItem(rest as RawBookingRow);
}

export async function listBookings(
  client: TClient,
  scope: OrgScope,
  filters: BookingListFilters = {},
): Promise<BookingListItem[]> {
  // Single query with nested select replaces the previous N+1 (one fetch per booking for treatments).
  const q = applyBookingFilters(
    client
      .from("bookings")
      .select(`${BOOKING_LIST_SELECT},\n      hotels!inner(id, organization_id)`)
      .order("booking_date", { ascending: true })
      .order("booking_time", { ascending: true }),
    scope,
    filters,
  );

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map(toListItem);
}

export type BookingPage = {
  items: BookingListItem[];
  /** Nombre total de réservations correspondant aux filtres, toutes pages confondues. */
  total: number;
};

/**
 * Une page de réservations, filtrée et triée par Postgres. Indispensable dès
 * que la liste dépasse le plafond de lignes de PostgREST : un filtre appliqué
 * côté client sur une réponse déjà tronquée donne un résultat faux, sans erreur.
 */
export async function listBookingsPage(
  client: TClient,
  scope: OrgScope,
  filters: BookingListFilters,
  page: { offset: number; limit: number; sort: BookingListSort },
): Promise<BookingPage> {
  const ascending = page.sort.direction === "asc";
  let q = applyBookingFilters(
    client
      .from("bookings")
      .select(`${BOOKING_LIST_SELECT},\n      hotels!inner(id, organization_id)`, {
        count: "exact",
      }),
    scope,
    filters,
  );

  for (const column of SORT_COLUMNS[page.sort.key]) {
    q = q.order(column, { ascending, nullsFirst: false });
  }
  // Départage stable : sans ça, deux lignes de même valeur peuvent changer de
  // page entre deux requêtes et apparaître en double ou disparaître.
  q = q.order("id", { ascending: true });

  const { data, error, count } = await q.range(
    page.offset,
    page.offset + page.limit - 1,
  );
  if (error) throw error;

  return { items: (data ?? []).map(toListItem), total: count ?? 0 };
}

/** Plafond de lignes de PostgREST : une réponse plus longue est tronquée en silence. */
const POSTGREST_PAGE_SIZE = 1000;

/**
 * Toutes les réservations correspondant aux filtres, récupérées par lots.
 * Réservé aux usages qui ont réellement besoin de l'ensemble (export CSV) —
 * l'affichage, lui, pagine.
 */
export async function listAllBookings(
  client: TClient,
  scope: OrgScope,
  filters: BookingListFilters,
  sort: BookingListSort,
  maxRows = 10_000,
): Promise<BookingListItem[]> {
  const items: BookingListItem[] = [];
  for (let offset = 0; offset < maxRows; offset += POSTGREST_PAGE_SIZE) {
    const page = await listBookingsPage(client, scope, filters, {
      offset,
      limit: Math.min(POSTGREST_PAGE_SIZE, maxRows - offset),
      sort,
    });
    items.push(...page.items);
    if (items.length >= page.total || page.items.length === 0) break;
  }
  return items;
}
