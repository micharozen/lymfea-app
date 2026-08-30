import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BookingWindow } from "@/lib/pwaBookingWindow";
import {
  PWA_BOOKING_ROW_LIMIT,
  PWA_BOOKING_SELECT,
  PWA_VENUE_BOOKING_SELECT,
  hotelIdsKey,
  pwaBookingKeys,
} from "./pwaBookingKeys";

export interface PwaBookingTreatment {
  therapist_id?: string | null;
  treatment_id?: string | null;
  is_addon?: boolean | null;
  /** Résolu côté client pour les duos : "Prénom N." du thérapeute affecté. */
  therapistShortName?: string | null;
  treatment_menus: { name: string; price: number; duration: number } | null;
}

export interface ProposedSlots {
  slot_1_date: string;
  slot_1_time: string;
  slot_2_date?: string | null;
  slot_2_time?: string | null;
  slot_3_date?: string | null;
  slot_3_time?: string | null;
}

/**
 * Forme unique des réservations du PWA, en remplacement des deux interfaces
 * `Booking` locales et divergentes de Dashboard.tsx et Bookings.tsx.
 *
 * Règle structurante : ces lignes ne portent **que** des données issues de la
 * base. L'enrichissement (image/devise/commission du lieu, créneaux proposés)
 * est fusionné par le consommateur, jamais écrit dans le cache. C'est le
 * correctif de fond du bug qu'avait produit le prefetch du Layout : deux
 * écrivains ne peuvent plus diverger sur une forme puisqu'il y a exactement un
 * écrivain par clé.
 */
export interface PwaBooking {
  id: string;
  booking_id: number;
  booking_date: string;
  booking_time: string;
  client_first_name: string;
  client_last_name: string;
  phone: string | null;
  hotel_id: string;
  hotel_name: string;
  room_id?: string | null;
  room_number: string | null;
  room_name?: string | null;
  status: string;
  payment_status?: string | null;
  payment_method?: string | null;
  duration?: number | null;
  total_price?: number | null;
  guest_count?: number | null;
  is_out_of_hours?: boolean | null;
  therapist_id: string | null;
  therapist_name?: string | null;
  therapist_gender_preference?: string | null;
  declined_by?: string[] | null;
  broadcast_wave?: number | null;
  booking_therapists?: { status: string; therapist_id?: string; assigned_at?: string }[];
  booking_treatments?: PwaBookingTreatment[];
  /** Nom(s) affichable(s) du/des thérapeute(s), résolu(s) via RPC pour les duos. */
  therapistName?: string | null;
}

type RawRow = PwaBooking & {
  treatment_rooms?: { name: string | null } | null;
  therapists?: { first_name: string; last_name: string } | null;
};

/** Nom compact pour le planning : "Prénom N." */
function shortTherapistName(firstName: string, lastName: string): string {
  const initial = lastName.trim().charAt(0);
  return `${firstName.trim()}${initial ? ` ${initial.toUpperCase()}.` : ""}`;
}

/**
 * Noms des co-thérapeutes des duos.
 *
 * Passe par le RPC SECURITY DEFINER : la RLS de `therapists` n'expose que le
 * profil de l'appelant, un select direct manquerait le co-thérapeute.
 */
async function fetchDuoNames(rows: RawRow[]) {
  const duoIds = rows.filter((b) => (b.guest_count ?? 1) > 1).map((b) => b.id);

  const byBooking = new Map<string, string[]>();
  const byTherapist = new Map<string, string>();
  if (duoIds.length === 0) return { byBooking, byTherapist };

  const { data } = await supabase.rpc("get_booking_therapist_names", { _booking_ids: duoIds });

  for (const row of data ?? []) {
    const name = shortTherapistName(row.first_name, row.last_name);
    byBooking.set(row.booking_id, [...(byBooking.get(row.booking_id) ?? []), name]);
    byTherapist.set(row.therapist_id, name);
  }
  return { byBooking, byTherapist };
}

function mapRows(
  rows: RawRow[],
  duo: Awaited<ReturnType<typeof fetchDuoNames>>,
  venueScope: boolean,
): PwaBooking[] {
  return rows.map((b) => {
    const isDuo = (b.guest_count ?? 1) > 1;
    const duoNames = duo.byBooking.get(b.id) ?? [];

    return {
      ...b,
      room_name: b.treatment_rooms?.name ?? null,
      booking_treatments: isDuo
        ? b.booking_treatments?.map((bt) => ({
            ...bt,
            therapistShortName: bt.therapist_id
              ? duo.byTherapist.get(bt.therapist_id) ?? null
              : null,
          }))
        : b.booking_treatments,
      therapistName:
        duoNames.length > 0
          ? duoNames.join(" + ")
          : venueScope
            ? b.therapists
              ? shortTherapistName(b.therapists.first_name, b.therapists.last_name)
              : b.therapist_name ?? null
            : null,
    };
  });
}

function sortByDateTime(rows: PwaBooking[]): PwaBooking[] {
  return [...rows].sort((a, b) => {
    if (a.booking_date !== b.booking_date) return a.booking_date < b.booking_date ? -1 : 1;
    return a.booking_time < b.booking_time ? -1 : 1;
  });
}

/**
 * Réservations du thérapeute sur la fenêtre demandée.
 *
 * Les quatre allers-retours vivent dans un seul `queryFn` : une entrée de
 * cache, un seul état de chargement, aucun rendu intermédiaire. Les chaîner en
 * `useQuery` dépendants coûterait deux passes de rendu de plus et deux entrées
 * de cache susceptibles de diverger.
 */
export async function fetchMyBookingsWindow(
  therapistId: string,
  w: BookingWindow,
): Promise<PwaBooking[]> {
  // 1. Réservations où je suis thérapeute principal.
  //    Pas de filtre sur hotel_id : je suis le thérapeute assigné, c'est
  //    redondant — et c'est ce qui permet au dashboard et au planning de
  //    partager la même entrée de cache (ils divergeaient là-dessus).
  const { data: primary, error } = await supabase
    .from("bookings")
    .select(PWA_BOOKING_SELECT)
    .eq("therapist_id", therapistId)
    .neq("status", "cancelled")
    .gte("booking_date", w.from)
    .lte("booking_date", w.to)
    .order("booking_date", { ascending: true })
    .order("booking_time", { ascending: true })
    .limit(PWA_BOOKING_ROW_LIMIT);

  if (error) throw error;

  let rows = (primary ?? []) as unknown as RawRow[];

  // 2. Duos où je suis participant secondaire : le lien vit dans
  //    booking_therapists, pas dans bookings.therapist_id. La jointure !inner
  //    borne ce lookup à la même fenêtre — sinon toute la table de liaison est
  //    retéléchargée à chaque chargement.
  const { data: links } = await supabase
    .from("booking_therapists")
    .select("booking_id, bookings!inner(booking_date)")
    .eq("therapist_id", therapistId)
    .eq("status", "accepted")
    .gte("bookings.booking_date", w.from)
    .lte("bookings.booking_date", w.to);

  const primaryIds = new Set(rows.map((b) => b.id));
  const secondaryIds = (links ?? [])
    .map((l) => l.booking_id)
    .filter((id) => !primaryIds.has(id));

  // 3. Les lignes correspondantes, même select, même fenêtre.
  if (secondaryIds.length > 0) {
    const { data: secondary, error: secondaryError } = await supabase
      .from("bookings")
      .select(PWA_BOOKING_SELECT)
      .in("id", secondaryIds)
      .neq("status", "cancelled")
      .gte("booking_date", w.from)
      .lte("booking_date", w.to);

    if (secondaryError) throw secondaryError;
    rows = [...rows, ...((secondary ?? []) as unknown as RawRow[])];
  }

  // 4. Noms des co-thérapeutes.
  return sortByDateTime(mapRows(rows, await fetchDuoNames(rows), false));
}

/** Demandes en attente ouvertes sur les lieux du thérapeute, plus leurs créneaux proposés. */
export async function fetchPendingBookingsWindow(
  therapistId: string,
  hotelIds: string[],
  w: BookingWindow,
): Promise<{ bookings: PwaBooking[]; slotsByBooking: Map<string, ProposedSlots> }> {
  if (hotelIds.length === 0) return { bookings: [], slotsByBooking: new Map() };

  const { data, error } = await supabase
    .from("bookings")
    .select(PWA_BOOKING_SELECT)
    .in("hotel_id", hotelIds)
    .eq("status", "pending")
    .gte("booking_date", w.from)
    .lte("booking_date", w.to)
    .limit(PWA_BOOKING_ROW_LIMIT);

  if (error) throw error;

  const open = ((data ?? []) as unknown as RawRow[]).filter((b) => {
    // Duo encore ouvert : visible pour tous les thérapeutes du lieu qui n'ont
    // pas déjà accepté. Un duo complet est passé en 'confirmed', donc tout duo
    // encore 'pending' ici est ouvert.
    if ((b.guest_count ?? 1) > 1) {
      return !b.booking_therapists?.some(
        (bt) => bt.therapist_id === therapistId && bt.status === "accepted",
      );
    }
    // Solo : doit être non assigné, les assignés arrivent par mes réservations.
    return b.therapist_id === null;
  });

  const duoIds = open.filter((b) => (b.guest_count ?? 1) > 1).map((b) => b.id);
  const slotsByBooking = new Map<string, ProposedSlots>();

  if (duoIds.length > 0) {
    const { data: slots } = await supabase
      .from("booking_proposed_slots")
      .select(
        "booking_id, slot_1_date, slot_1_time, slot_2_date, slot_2_time, slot_3_date, slot_3_time",
      )
      .in("booking_id", duoIds);

    for (const s of slots ?? []) slotsByBooking.set(s.booking_id, s as ProposedSlots);
  }

  return {
    bookings: sortByDateTime(mapRows(open, await fetchDuoNames(open), false)),
    slotsByBooking,
  };
}

/** Toutes les réservations d'un lieu — scope « tout le lieu » du concierge. */
export async function fetchVenueBookingsWindow(
  hotelIds: string[],
  w: BookingWindow,
): Promise<PwaBooking[]> {
  if (hotelIds.length === 0) return [];

  const { data, error } = await supabase
    .from("bookings")
    .select(PWA_VENUE_BOOKING_SELECT)
    .in("hotel_id", hotelIds)
    .gte("booking_date", w.from)
    .lte("booking_date", w.to)
    .order("booking_date", { ascending: true })
    .order("booking_time", { ascending: true })
    .limit(PWA_BOOKING_ROW_LIMIT);

  if (error) throw error;

  // Les annulées sont conservées : la vue Liste les affiche pour la traçabilité,
  // les grilles Jour / 3 jours les filtrent côté consommateur.
  const rows = (data ?? []) as unknown as RawRow[];
  return sortByDateTime(mapRows(rows, await fetchDuoNames(rows), true));
}

const SHARED_QUERY_OPTIONS = {
  staleTime: 30_000,
  gcTime: 5 * 60_000,
  // Faire glisser le calendrier ne doit pas faire clignoter une grille vide.
  placeholderData: keepPreviousData,
} as const;

export function useMyBookingsWindow(
  therapistId: string | null | undefined,
  w: BookingWindow,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: pwaBookingKeys.mine(therapistId ?? "", w),
    queryFn: () => fetchMyBookingsWindow(therapistId!, w),
    enabled: (options?.enabled ?? true) && !!therapistId,
    ...SHARED_QUERY_OPTIONS,
  });
}

export function usePendingBookingsWindow(
  therapistId: string | null | undefined,
  hotelIds: string[] | undefined,
  w: BookingWindow,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: pwaBookingKeys.pending(therapistId ?? "", w),
    queryFn: () => fetchPendingBookingsWindow(therapistId!, hotelIds ?? [], w),
    enabled: (options?.enabled ?? true) && !!therapistId && !!hotelIds,
    ...SHARED_QUERY_OPTIONS,
  });
}

export function useVenueBookingsWindow(
  hotelIds: string[] | undefined,
  w: BookingWindow,
  options?: { enabled?: boolean },
) {
  const ids = hotelIds ?? [];
  return useQuery({
    queryKey: pwaBookingKeys.venue(hotelIdsKey(ids), w),
    queryFn: () => fetchVenueBookingsWindow(ids, w),
    enabled: (options?.enabled ?? true) && ids.length > 0,
    ...SHARED_QUERY_OPTIONS,
  });
}
