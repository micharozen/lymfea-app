import { supabase } from "@/integrations/supabase/client";

export interface BookingSearchResult {
  id: string;
  booking_id: number | null;
  client_first_name: string | null;
  client_last_name: string | null;
  customer: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
}

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
 * - Sinon → `ilike` sur le prénom/nom du client.
 * Limité à 20 résultats, triés du plus récent au plus ancien.
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
    .select(
      "id, booking_id, client_first_name, client_last_name, customer:customers(id, first_name, last_name, phone, email)",
    )
    .order("created_at", { ascending: false })
    .limit(20);
  if (options.paymentStatusIn && options.paymentStatusIn.length > 0) {
    q = q.in("payment_status", options.paymentStatusIn);
  }
  if (!Number.isNaN(numeric)) {
    q = q.eq("booking_id", numeric);
  } else {
    q = q.or(
      `client_first_name.ilike.%${trimmed}%,client_last_name.ilike.%${trimmed}%`,
    );
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as BookingSearchResult[];
}
