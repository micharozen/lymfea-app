import type { PwaBooking } from "@/hooks/pwa/usePwaBookings";

/**
 * Réservation « à moi » dans l'agenda du lieu : elle m'est affectée, je porte
 * l'une de ses prestations (duo), ou j'ai accepté la demande de diffusion.
 */
export function isMyBooking(
  b: PwaBooking,
  therapistId: string | null | undefined,
): boolean {
  if (!therapistId) return false;
  if (b.therapist_id === therapistId) return true;
  if ((b.booking_treatments ?? []).some((bt) => bt.therapist_id === therapistId)) return true;
  return (b.booking_therapists ?? []).some(
    (bt) => bt.therapist_id === therapistId && bt.status === "accepted",
  );
}
