import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HandHeart, Pencil, Loader2, Check, X, DoorClosed } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/formatPrice";
import { computeTherapistEarnings, type TherapistRates } from "@/lib/therapistEarnings";
import { therapistForTreatment } from "@/lib/therapistForTreatment";
import { useReassignTreatmentTherapists, type LineAssignment } from "@/hooks/booking/useReassignTreatmentTherapists";
import type { BookingTreatment } from "@/hooks/booking/useBookingData";

interface RosterTherapist {
  id: string;
  first_name: string;
  last_name: string;
}

interface TreatmentsByTherapistProps {
  bookingId: string;
  hotelId: string | null;
  guestCount: number;
  treatments: BookingTreatment[];
  /** bookings.therapist_id — used as the solo fallback when a line has no link. */
  primaryTherapistId: string | null;
  /** Accepted duo roster, in acceptance order (positional fallback). */
  acceptedTherapists: RosterTherapist[];
  roomName: string | null;
  secondaryRoomName: string | null;
  currency: string;
  therapistRatesMap?: Record<string, TherapistRates>;
  /** true = commission % mode, false = fixed-rate mode, undefined = hide earnings. */
  globalTherapistCommission?: boolean;
  therapistCommission?: number;
  surchargePercent?: number;
  onReassigned: () => void;
}

interface TherapistGroup {
  /** Effective therapist id for the group. null = unassigned soins. */
  therapistId: string | null;
  therapistName: string;
  room: string | null;
  lines: Array<{
    bookingTreatmentId: string;
    name: string;
    duration: number | null;
    price: number | null;
  }>;
  totalDuration: number;
  totalAmount: number;
  earnings: number | null | undefined;
}

/**
 * Récapitulatif des soins regroupés par thérapeute (solo + duo unifiés).
 * Chaque thérapeute regroupe ses soins (principal + add-ons). Un crayon ouvre
 * un sélecteur inline qui réassigne directement le therapist_id des lignes.
 */
export function TreatmentsByTherapist({
  bookingId,
  hotelId,
  guestCount,
  treatments,
  primaryTherapistId,
  acceptedTherapists,
  roomName,
  secondaryRoomName,
  currency,
  therapistRatesMap,
  globalTherapistCommission,
  therapistCommission,
  surchargePercent = 0,
  onReassigned,
}: TreatmentsByTherapistProps) {
  const showEarnings = globalTherapistCommission !== undefined;
  const { reassign, loading: reassigning } = useReassignTreatmentTherapists();
  // bookingTreatmentId of the soin line currently being reassigned (null = none).
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [pendingTherapistId, setPendingTherapistId] = useState<string>("");

  // Assignable therapists = active therapists linked to this venue (same source
  // as the edit dialog). Also the name lookup for solo/duo therapists.
  const { data: assignable = [] } = useQuery({
    queryKey: ["venue-therapists", hotelId],
    enabled: !!hotelId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("therapist_venues")
        .select("therapists(id, first_name, last_name, status)")
        .eq("hotel_id", hotelId!);
      if (error) throw error;
      type VenueRow = { therapists: (RosterTherapist & { status: string | null }) | (RosterTherapist & { status: string | null })[] | null };
      return ((data ?? []) as VenueRow[])
        .map((row) => (Array.isArray(row.therapists) ? row.therapists[0] : row.therapists))
        .filter((t): t is RosterTherapist & { status: string | null } => {
          if (!t) return false;
          const s = (t.status ?? "").toLowerCase();
          return s === "active" || s === "actif";
        })
        .sort((a, b) => (a.first_name ?? "").localeCompare(b.first_name ?? "")) as RosterTherapist[];
    },
  });

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of assignable) map.set(t.id, `${t.first_name} ${t.last_name}`.trim());
    for (const t of acceptedTherapists) map.set(t.id, `${t.first_name} ${t.last_name}`.trim());
    return map;
  }, [assignable, acceptedTherapists]);

  const rosterIds = useMemo(() => acceptedTherapists.map((t) => t.id), [acceptedTherapists]);

  // Effective therapist per line: explicit link first, then the positional
  // (combo-duo) / solo fallback used elsewhere in the app.
  const resolveTherapistId = (line: BookingTreatment, index: number): string | null => {
    if (line.therapist_id) return line.therapist_id;
    if (guestCount <= 1) return primaryTherapistId ?? null;
    return therapistForTreatment(index, treatments.length, guestCount, rosterIds);
  };

  const lineTherapistIds = useMemo(
    () => treatments.map((t, i) => resolveTherapistId(t, i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [treatments, guestCount, primaryTherapistId, rosterIds],
  );

  const groups = useMemo<TherapistGroup[]>(() => {
    const order: (string | null)[] = [];
    const byId = new Map<string | null, TherapistGroup>();

    treatments.forEach((t, i) => {
      const therapistId = lineTherapistIds[i];
      if (!byId.has(therapistId)) {
        order.push(therapistId);
        byId.set(therapistId, {
          therapistId,
          therapistName: therapistId ? (nameById.get(therapistId) ?? "Thérapeute") : "Non assigné",
          room: null,
          lines: [],
          totalDuration: 0,
          totalAmount: 0,
          earnings: undefined,
        });
      }
      const g = byId.get(therapistId)!;
      g.lines.push({
        bookingTreatmentId: t.bookingTreatmentId ?? "",
        name: t.name,
        duration: t.duration,
        price: t.price,
      });
      g.totalDuration += t.duration ?? 0;
      g.totalAmount += t.price ?? 0;
    });

    return order.map((id, groupIndex) => {
      const g = byId.get(id)!;
      // Room follows the group order: first group → primary room, others → secondary.
      g.room = (groupIndex === 0 ? roomName : secondaryRoomName ?? roomName) ?? null;
      if (!showEarnings || !id) {
        g.earnings = showEarnings ? null : undefined;
      } else if (globalTherapistCommission) {
        g.earnings = Math.round(g.totalAmount * ((therapistCommission ?? 70) / 100) * 100) / 100;
      } else {
        g.earnings = computeTherapistEarnings(
          therapistRatesMap?.[id] ?? null,
          g.totalDuration,
          { surchargePercent },
        );
      }
      return g;
    });
  }, [treatments, lineTherapistIds, nameById, roomName, secondaryRoomName, showEarnings, globalTherapistCommission, therapistCommission, therapistRatesMap, surchargePercent]);

  const startEdit = (lineId: string, currentTherapistId: string | null) => {
    setEditingLineId(lineId);
    setPendingTherapistId(currentTherapistId ?? "");
  };

  const cancelEdit = () => {
    setEditingLineId(null);
    setPendingTherapistId("");
  };

  const confirmEdit = async (lineId: string, currentTherapistId: string | null) => {
    if (!pendingTherapistId || pendingTherapistId === currentTherapistId) {
      cancelEdit();
      return;
    }
    // Materialise every line: the edited soin moves to the new therapist, all
    // other lines keep their resolved therapist. Lines without a resolvable
    // therapist are skipped (their link stays NULL).
    const assignments: LineAssignment[] = treatments
      .map((t, i) => {
        const bookingTreatmentId = t.bookingTreatmentId;
        if (!bookingTreatmentId) return null;
        const therapistId = bookingTreatmentId === lineId ? pendingTherapistId : lineTherapistIds[i];
        return therapistId ? { bookingTreatmentId, therapistId } : null;
      })
      .filter((a): a is LineAssignment => a !== null);

    try {
      await reassign(bookingId, assignments);
      toast.success("Thérapeute réassigné.");
      cancelEdit();
      onReassigned();
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Erreur lors de la réassignation.");
    }
  };

  return (
    <section className="bg-white rounded-xl border p-6 shadow-sm">
      <h3 className="text-sm font-bold text-muted-foreground uppercase mb-4 flex items-center gap-2">
        <HandHeart className="h-4 w-4" /> Soins & Praticien{guestCount > 1 ? "s" : ""}
      </h3>

      <div className="space-y-3">
        {groups.map((group) => {
          return (
            <div
              key={group.therapistId ?? "unassigned"}
              className="rounded-lg border border-gray-100 bg-gray-50/60 overflow-hidden"
            >
              {/* En-tête thérapeute */}
              <div className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/40 border-b border-gray-100">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                    {group.therapistName?.charAt(0) || "?"}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{group.therapistName}</p>
                    {group.room && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <DoorClosed className="h-3 w-3" /> {group.room}
                      </p>
                    )}
                  </div>
                </div>

                {showEarnings && (
                  <div className="text-right shrink-0">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Gain</p>
                    {group.earnings != null ? (
                      <p className="text-sm font-semibold">{formatPrice(group.earnings, currency)}</p>
                    ) : (
                      <p className="text-[11px] text-amber-600">Tarifs incomplets</p>
                    )}
                  </div>
                )}
              </div>

              {/* Soins du thérapeute — crayon par ligne */}
              <div className="divide-y divide-gray-100">
                {group.lines.map((line, i) => {
                  const lineId = line.bookingTreatmentId;
                  const isEditingLine = !!lineId && editingLineId === lineId;
                  return (
                    <div key={lineId || i} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm min-w-0">
                          {line.name}
                          {line.duration ? (
                            <span className="text-muted-foreground"> · {line.duration} min</span>
                          ) : null}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-semibold whitespace-nowrap">
                            {formatPrice(line.price ?? 0, currency)}
                          </span>
                          {!isEditingLine && lineId && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              onClick={() => startEdit(lineId, group.therapistId)}
                              title="Réassigner ce soin"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {isEditingLine && (
                        <div className="mt-2 flex items-center gap-2">
                          <Select value={pendingTherapistId} onValueChange={setPendingTherapistId}>
                            <SelectTrigger className="h-8 w-[200px]">
                              <SelectValue placeholder="Choisir un thérapeute" />
                            </SelectTrigger>
                            <SelectContent>
                              {assignable.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.first_name} {t.last_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-emerald-600"
                            onClick={() => confirmEdit(lineId, group.therapistId)}
                            disabled={reassigning}
                          >
                            {reassigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={cancelEdit}
                            disabled={reassigning}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
