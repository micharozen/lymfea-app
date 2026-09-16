/**
 * Périmètre du chiffre d'affaires d'une réservation.
 *
 * Le CA était partout indexé sur `status = 'completed'` seul, alors que la
 * facturation est portée par `payment_status`. Un no-show facturé — le client
 * ne s'est pas présenté mais la prestation lui est due — tombait donc hors de
 * tous les totaux (cas #1613 au Cap d'Antibes : 480 € facturés en chambre,
 * absents de la clôture comme du tableau de bord), alors que la facture
 * thérapeute le comptait déjà : le thérapeute s'est déplacé, il est rémunéré.
 *
 * Ce module est la règle unique partagée par la clôture quotidienne (écran,
 * PDF, email), le tableau de bord, le prévisionnel et la facturation du lieu.
 */

/** Les deux orthographes du statut coexistent en base (legacy `no_show`). */
export const NO_SHOW_STATUSES = ["noshow", "no_show"] as const;

/**
 * Statuts de paiement pour lesquels l'argent est réellement dû : encaissé
 * (`paid`), porté sur la note de la chambre (`charged_to_room`) ou offert par
 * le lieu (`offert`, montant nul mais prestation comptabilisée). Un no-show
 * resté `pending` n'a rien facturé et ne doit donc rien peser.
 *
 * Même liste que `generate-therapist-invoices`, pour que la rémunération du
 * thérapeute et le CA du lieu portent toujours sur les mêmes réservations.
 */
export const BILLED_PAYMENT_STATUSES = ["paid", "charged_to_room", "offert"] as const;

export interface RevenueBooking {
  status: string;
  payment_status?: string | null;
  total_price?: number | null;
  /**
   * Frais retenus au titre du no-show (`booking_payment_infos`). Quand une
   * empreinte a été capturée, c'est ce montant qui a réellement été débité —
   * il peut différer de `total_price` (résa #1352 : prix 0, frais 115 €).
   */
  cancellation_fee_amount?: number | null;
}

export function isNoShowStatus(status: string | null | undefined): boolean {
  return (NO_SHOW_STATUSES as readonly string[]).includes(String(status ?? ""));
}

function isBilledPaymentStatus(paymentStatus: string | null | undefined): boolean {
  return (BILLED_PAYMENT_STATUSES as readonly string[]).includes(String(paymentStatus ?? ""));
}

/** Un no-show dont la prestation a bien été facturée au client. */
export function isBilledNoShow(booking: RevenueBooking): boolean {
  if (!isNoShowStatus(booking.status)) return false;
  if (isBilledPaymentStatus(booking.payment_status)) return true;
  // Empreinte capturée sans que le statut de paiement ait suivi.
  return (Number(booking.cancellation_fee_amount) || 0) > 0;
}

/** Réservations retenues dans le CA, hors projection des résas non finalisées. */
export function countsAsRevenue(booking: RevenueBooking): boolean {
  return booking.status === "completed" || isBilledNoShow(booking);
}

/**
 * Montant facturé au client. Pour un no-show, les frais retenus priment sur le
 * prix de la réservation : c'est la somme réellement débitée.
 */
export function bookingBilledAmount(booking: RevenueBooking): number {
  const total = Number(booking.total_price) || 0;
  if (!isNoShowStatus(booking.status)) return total;
  const fee = Number(booking.cancellation_fee_amount) || 0;
  return fee > 0 ? fee : total;
}

/** Embed PostgREST de `booking_payment_infos` : objet (relation 1-1) ou tableau. */
export type PaymentInfoEmbed =
  | { cancellation_fee_amount: number | null }
  | Array<{ cancellation_fee_amount: number | null }>
  | null
  | undefined;

/**
 * Frais de no-show portés par l'embed. `booking_id` est UNIQUE, donc PostgREST
 * renvoie un objet — mais les types générés décrivent la relation comme un
 * tableau. On accepte les deux formes plutôt que de forcer un cast.
 */
export function noShowFeeFrom(embed: PaymentInfoEmbed): number | null {
  if (!embed) return null;
  const row = Array.isArray(embed) ? embed[0] : embed;
  return row?.cancellation_fee_amount ?? null;
}
