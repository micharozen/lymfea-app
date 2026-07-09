import { useMemo } from "react";
import { HandHeart } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatPrice } from "@/lib/formatPrice";
import { computeTherapistEarnings, type TherapistRates } from "@/lib/therapistEarnings";
import type { BookingTreatment } from "@/hooks/booking/useBookingData";

interface AcceptedTherapist {
  id: string;
  first_name: string;
  last_name: string;
}

interface DuoRecapTableProps {
  treatments: BookingTreatment[];
  acceptedTherapists: AcceptedTherapist[];
  guestCount: number;
  roomName: string | null;
  secondaryRoomName: string | null;
  bookingTime: string | null;
  displayPrice: number;
  currency: string;
  /** Per-therapist fixed rates, keyed by therapist id (fixed-rate mode). */
  therapistRatesMap?: Record<string, TherapistRates>;
  /** true = commission % mode, false = fixed-rate mode. When undefined, the earnings column is hidden. */
  globalTherapistCommission?: boolean;
  /** Commission percent used in commission % mode. */
  therapistCommission?: number;
  /** Out-of-hours surcharge percent (fixed-rate mode only). 0 when not out of hours. */
  surchargePercent?: number;
}

interface DuoLeg {
  soin: string;
  duration: number | null;
  therapist: string;
  room: string;
  amount: number;
  schedule: string;
  /** Therapist earning for this leg. null = rates incomplete. undefined = column hidden. */
  earnings: number | null | undefined;
}

/** "HH:MM:SS" / "HH:MM" + minutes → "HH:MM — HH:MM" (pure minute math, no TZ). */
function formatSchedule(bookingTime: string | null, duration: number | null): string {
  if (!bookingTime) return "-";
  const [h, m] = bookingTime.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return "-";
  const start = h * 60 + m;
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (mins: number) => `${pad(Math.floor((mins % 1440) / 60))}:${pad(mins % 60)}`;
  if (!duration || duration <= 0) return fmt(start);
  return `${fmt(start)} — ${fmt(start + duration)}`;
}

/**
 * Tableau récapitulatif d'un booking Duo : une ligne par jambe
 * (Soin × Thérapeute × Salle × Montant × Horaire). Mapping positionnel par index.
 */
export function DuoRecapTable({
  treatments,
  acceptedTherapists,
  guestCount,
  roomName,
  secondaryRoomName,
  bookingTime,
  displayPrice,
  currency,
  therapistRatesMap,
  globalTherapistCommission,
  therapistCommission,
  surchargePercent = 0,
}: DuoRecapTableProps) {
  // Earnings column is shown only when the caller provides the pay mode.
  const showEarnings = globalTherapistCommission !== undefined;

  const legs = useMemo<DuoLeg[]>(() => {
    // Combo-duo : un soin distinct par invité. Sinon (duo-variante) : soin partagé + montant divisé.
    const perTreatment = treatments.length === guestCount && guestCount > 0;
    const sharedAmount = guestCount > 0 ? displayPrice / guestCount : displayPrice;
    // Lien stable soin↔thérapeute (combo-duo) : on résout par booking_treatments.therapist_id.
    // Fallback positionnel (anciens duos sans lien, ou duo-variante partagé).
    const therapistById = new Map(acceptedTherapists.map((th) => [th.id, th]));

    return Array.from({ length: Math.max(guestCount, 1) }, (_, i) => {
      const t = perTreatment ? treatments[i] : treatments[0];
      const linkedId = perTreatment ? t?.therapist_id : null;
      const therapist = (linkedId ? therapistById.get(linkedId) : undefined) ?? acceptedTherapists[i];

      // Per-leg therapist earning. Fixed-rate mode uses this therapist's rates
      // and their own treatment duration, uplifted by the out-of-hours surcharge.
      // Commission % mode keeps the price-based split (surcharge already baked in).
      let earnings: number | null | undefined;
      if (!showEarnings) {
        earnings = undefined;
      } else if (globalTherapistCommission) {
        earnings = Math.round((sharedAmount * ((therapistCommission ?? 70) / 100)) * 100) / 100;
      } else if (therapist) {
        earnings = computeTherapistEarnings(
          therapistRatesMap?.[therapist.id] ?? null,
          t?.duration ?? 0,
          { surchargePercent },
        );
      } else {
        earnings = null;
      }

      return {
        soin: t?.name ?? "-",
        duration: t?.duration ?? null,
        therapist: therapist
          ? `${therapist.first_name} ${therapist.last_name}`.trim()
          : "En attente",
        room: (i === 0 ? roomName : secondaryRoomName ?? roomName) ?? "-",
        amount: perTreatment ? t?.price ?? 0 : sharedAmount,
        schedule: formatSchedule(bookingTime, t?.duration ?? null),
        earnings,
      };
    });
  }, [treatments, acceptedTherapists, guestCount, roomName, secondaryRoomName, bookingTime, displayPrice, showEarnings, globalTherapistCommission, therapistCommission, therapistRatesMap, surchargePercent]);

  return (
    <section className="bg-white rounded-xl border p-6 shadow-sm">
      <h3 className="text-sm font-bold text-muted-foreground uppercase mb-4 flex items-center gap-2">
        <HandHeart className="h-4 w-4" /> Récapitulatif Duo
      </h3>

      {/* Tableau (≥ sm) */}
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Soin</TableHead>
              <TableHead>Thérapeute</TableHead>
              <TableHead>Salle</TableHead>
              <TableHead className="text-right">Montant</TableHead>
              {showEarnings && <TableHead className="text-right">Gain thérapeute</TableHead>}
              <TableHead className="text-right">Horaire</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {legs.map((leg, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">
                  {leg.soin}
                  {leg.duration ? (
                    <span className="text-muted-foreground"> · {leg.duration} min</span>
                  ) : null}
                </TableCell>
                <TableCell>{leg.therapist}</TableCell>
                <TableCell>{leg.room}</TableCell>
                <TableCell className="text-right font-semibold whitespace-nowrap">
                  {formatPrice(leg.amount, currency)}
                </TableCell>
                {showEarnings && (
                  <TableCell className="text-right whitespace-nowrap">
                    {leg.earnings != null ? (
                      <span className="font-semibold">{formatPrice(leg.earnings, currency)}</span>
                    ) : (
                      <span className="text-xs text-amber-600">Tarifs incomplets</span>
                    )}
                  </TableCell>
                )}
                <TableCell className="text-right whitespace-nowrap">{leg.schedule}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Cartes (mobile) */}
      <div className="space-y-3 sm:hidden">
        {legs.map((leg, i) => (
          <div key={i} className="p-3 bg-gray-50 rounded-lg space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {leg.soin}
                {leg.duration ? (
                  <span className="text-muted-foreground"> · {leg.duration} min</span>
                ) : null}
              </span>
              <span className="font-semibold whitespace-nowrap">
                {formatPrice(leg.amount, currency)}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Thérapeute</span>
              <span className="text-foreground">{leg.therapist}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Salle</span>
              <span className="text-foreground">{leg.room}</span>
            </div>
            {showEarnings && (
              <div className="flex justify-between text-muted-foreground">
                <span>Gain thérapeute</span>
                {leg.earnings != null ? (
                  <span className="font-semibold text-foreground">{formatPrice(leg.earnings, currency)}</span>
                ) : (
                  <span className="text-xs text-amber-600">Tarifs incomplets</span>
                )}
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>Horaire</span>
              <span className="text-foreground">{leg.schedule}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
