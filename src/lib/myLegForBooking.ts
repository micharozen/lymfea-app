import {
  bookingSlotDuration,
  myLegDuration,
  myLegTreatments,
  type LegTreatment,
} from "@/lib/therapistLegDuration";

/**
 * Part d'une réservation qui revient à un praticien donné.
 *
 * Un praticien seul porte toute la réservation ; sur une réservation partagée —
 * duo, ou booking simple à plusieurs soins pris par plusieurs praticiens
 * (issue #547) — chacun ne compte que la sienne.
 *
 * Extrait du tableau de bord PWA pour que l'agenda du lendemain annonce
 * exactement les mêmes durées : deux calculs parallèles finiraient par diverger.
 */

export interface LegBookingTreatment {
  therapist_id?: string | null;
  treatment_id?: string | null;
  is_addon?: boolean | null;
  treatment_menus?: { duration?: number | null } | null;
}

export interface LegBooking {
  duration?: number | null;
  guest_count?: number | null;
  booking_treatments?: LegBookingTreatment[] | null;
  booking_therapists?: { therapist_id?: string | null; status: string; assigned_at?: string | null }[] | null;
}

const DEFAULT_DURATION_MINUTES = 60;

/** Lignes de soin réduites à ce dont le moteur de répartition a besoin. */
export function legLineInputs(b: LegBooking): LegTreatment[] {
  return (b.booking_treatments ?? []).map((t) => ({
    therapist_id: t.therapist_id ?? null,
    treatment_id: t.treatment_id ?? null,
    duration: t.treatment_menus?.duration ?? null,
    is_addon: t.is_addon ?? false,
  }));
}

/** Praticiens ayant accepté, dans l'ordre stable attendu par le moteur. */
export function orderedTherapistIds(b: LegBooking): string[] {
  return (b.booking_therapists ?? [])
    .filter((bt) => bt.status === "accepted" && !!bt.therapist_id)
    .sort((x, y) => (x.assigned_at || "").localeCompare(y.assigned_at || ""))
    .map((bt) => bt.therapist_id as string);
}

/**
 * Minutes que la réservation occupe au calendrier, praticiens confondus.
 * `bookings.duration` fait foi quand elle est posée : elle absorbe les
 * prolongations de séance, qui n'ajoutent aucune ligne de soin.
 */
export function bookingWallClockDuration(b: LegBooking): number {
  if (b.duration && b.duration > 0) return b.duration;
  const lines = legLineInputs(b);
  if (lines.length === 0) return DEFAULT_DURATION_MINUTES;
  const duration = bookingSlotDuration(lines, b.guest_count ?? 1);
  return duration > 0 ? duration : DEFAULT_DURATION_MINUTES;
}

/** Lignes de soin dont ce praticien est responsable. */
export function myLegLines(b: LegBooking, therapistId: string | null | undefined): LegTreatment[] {
  return myLegTreatments(
    therapistId ?? "",
    legLineInputs(b),
    orderedTherapistIds(b),
    b.guest_count ?? 1,
  );
}

/** Minutes réellement dues à ce praticien sur cette réservation. */
export function myLegMinutes(b: LegBooking, therapistId: string | null | undefined): number {
  const guestCount = b.guest_count ?? 1;
  const lines = legLineInputs(b);
  const mine = myLegLines(b, therapistId);
  // Hors partage, la durée de la réservation fait foi.
  if (mine.length === lines.length && guestCount <= 1) return bookingWallClockDuration(b);
  return myLegDuration(therapistId ?? "", lines, orderedTherapistIds(b), guestCount);
}

/** « 4h30 », « 45 min ». */
export function formatLegMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}
