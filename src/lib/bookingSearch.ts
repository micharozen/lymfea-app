import { supabase } from "@/integrations/supabase/client";
import { buildPersonSearchFilter } from "@shared/db";

export interface BookingSearchResult {
  id: string;
  booking_id: number | null;
  booking_date: string | null;
  hotel_id: string | null;
  client_type: string | null;
  client_first_name: string | null;
  client_last_name: string | null;
  booking_treatments: { treatment_id: string | null; is_addon: boolean | null }[] | null;
  booking_therapists: { therapist_id: string | null }[] | null;
  customer: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
}

/** Colonnes ramenées pour une réservation : de quoi remplir une tâche. */
const BOOKING_SELECT =
  "id, booking_id, booking_date, hotel_id, client_type, client_first_name, client_last_name, " +
  "booking_treatments(treatment_id, is_addon), booking_therapists(therapist_id), " +
  "customer:customers(id, first_name, last_name, phone, email)";

export interface BookingSearchOptions {
  /**
   * Restreint la recherche aux réservations dont `payment_status` est dans
   * cette liste. Utilisé par l'action de remboursement pour ne proposer que
   * des réservations payées (et donc pas déjà remboursées).
   */
  paymentStatusIn?: string[];
}

/**
 * Recherche server-backed de réservations pour un combobox admin.
 * - Requête numérique → match exact sur `booking_id` (identifiant humain).
 * - Sinon → recherche sur le nom du client, « Prénom Nom » compris.
 * Limité à 20 résultats, triés du plus récent au plus ancien.
 *
 * Les soins, thérapeutes, lieu et date sont ramenés avec la ligne : ils
 * servent à pré-remplir une tâche dès qu'on y rattache une réservation.
 */
export async function searchBookings(
  query: string,
  options: BookingSearchOptions = {},
): Promise<BookingSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const numeric = Number.parseInt(trimmed, 10);
  let q = supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .order("created_at", { ascending: false })
    .limit(20);
  if (options.paymentStatusIn && options.paymentStatusIn.length > 0) {
    q = q.in("payment_status", options.paymentStatusIn);
  }
  if (!Number.isNaN(numeric)) {
    q = q.eq("booking_id", numeric);
  } else {
    const filter = buildPersonSearchFilter(trimmed, "client_first_name", "client_last_name");
    if (filter === null) return [];
    q = q.or(filter);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as BookingSearchResult[];
}

/**
 * Charge une réservation par son id, avec le même contenu que la recherche.
 *
 * Sert quand la réservation a été choisie ailleurs que dans le combobox — par
 * la recherche globale, par exemple — et qu'il faut en reprendre le contexte.
 */
export async function fetchBookingById(id: string): Promise<BookingSearchResult | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as BookingSearchResult | null;
}

/**
 * Libellé d'une réservation dans les listes et sélecteurs admin :
 * `#123 · Jean Dupont · 12/07/2026`.
 *
 * Le numéro seul ne suffit pas à lever l'ambiguïté quand plusieurs
 * réservations portent le même nom — la date tranche.
 */
export function formatBookingLabel(booking: BookingSearchResult, locale = "fr-FR"): string {
  const name = `${booking.client_first_name ?? ""} ${booking.client_last_name ?? ""}`.trim();
  const parts = [`#${booking.booking_id ?? "?"}`];
  if (name) parts.push(name);
  if (booking.booking_date) {
    const date = new Date(`${booking.booking_date}T00:00:00`);
    if (!Number.isNaN(date.getTime())) parts.push(date.toLocaleDateString(locale));
  }
  return parts.join(" · ");
}
