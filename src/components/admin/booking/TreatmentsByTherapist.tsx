import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { HandHeart, Pencil, Loader2, Check, X, DoorClosed, Waves } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/formatPrice";
import { computeTherapistEarnings, type TherapistRates } from "@/lib/therapistEarnings";
import { getAmenityType } from "@/lib/amenityTypes";
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

// Accent par thérapeute (indexé sur l'ordre des groupes) : anneau d'avatar +
// bordure gauche des lignes — lecture instantanée de « qui fait quoi » en duo.
const GROUP_ACCENTS = [
  { avatar: "bg-violet-50 text-violet-700 ring-violet-200", border: "border-l-violet-300" },
  { avatar: "bg-sky-50 text-sky-700 ring-sky-200", border: "border-l-sky-300" },
  { avatar: "bg-rose-50 text-rose-700 ring-rose-200", border: "border-l-rose-300" },
  { avatar: "bg-emerald-50 text-emerald-700 ring-emerald-200", border: "border-l-emerald-300" },
] as const;
const UNASSIGNED_ACCENT = { avatar: "bg-stone-100 text-stone-500 ring-stone-200", border: "border-l-stone-300" } as const;

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
  const navigate = useNavigate();
  const showEarnings = globalTherapistCommission !== undefined;
  const { reassign, loading: reassigning } = useReassignTreatmentTherapists();
  // bookingTreatmentId of the soin line currently being reassigned (null = none).
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [pendingTherapistId, setPendingTherapistId] = useState<string>("");

  // Un accès « amenity » (piscine, sauna…) n'a jamais de praticien : on l'exclut
  // de tout le regroupement/réassignation et on l'affiche à part.
  const serviceTreatments = useMemo(() => treatments.filter((t) => !t.is_amenity), [treatments]);
  const amenityTreatments = useMemo(() => treatments.filter((t) => t.is_amenity), [treatments]);
  const hasServices = serviceTreatments.length > 0;

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

  // Effective therapist per line. The explicit soin↔therapist link
  // (booking_treatments.therapist_id) is authoritative; the positional roster
  // fallback only fills legs that still have no link — and never re-uses a
  // therapist already linked to another leg. This keeps a partially-accepted
  // combo-duo honest: one leg linked to the therapist who accepted, the other
  // shown "Non assigné" until the second therapist accepts.
  const lineTherapistIds = useMemo<(string | null)[]>(() => {
    if (guestCount <= 1) {
      // Solo: explicit link per line, else the single primary therapist.
      const solo = primaryTherapistId ?? null;
      return serviceTreatments.map((t) => t.therapist_id ?? solo);
    }

    // Duo: assign each line to a leg (base soins take legs 0..n-1 in order,
    // add-ons inherit their leg round-robin — same convention as booking
    // creation), then resolve therapists per leg.
    const legOfLine: number[] = [];
    let baseLeg = 0;
    let addonSeq = 0;
    for (const t of serviceTreatments) {
      legOfLine.push(t.is_addon ? addonSeq++ % guestCount : baseLeg++);
    }
    const isComboDuo = baseLeg === guestCount;
    // Shared-duo (1 soin, N thérapeutes): no positional pairing — trust the
    // explicit link only.
    if (!isComboDuo) return serviceTreatments.map((t) => t.therapist_id ?? null);

    const legTherapist: (string | null)[] = Array.from({ length: guestCount }, () => null);
    // 1) Explicit links win, onto their own leg (first link per leg).
    serviceTreatments.forEach((t, i) => {
      if (t.therapist_id && legTherapist[legOfLine[i]] == null) {
        legTherapist[legOfLine[i]] = t.therapist_id;
      }
    });
    // 2) Fill the still-empty legs from roster therapists not already linked.
    const used = new Set(legTherapist.filter((id): id is string => !!id));
    const available = rosterIds.filter((id) => !used.has(id));
    let next = 0;
    for (let leg = 0; leg < guestCount; leg++) {
      if (legTherapist[leg] == null && next < available.length) {
        legTherapist[leg] = available[next++];
      }
    }

    return serviceTreatments.map((_, i) => legTherapist[legOfLine[i]]);
  }, [serviceTreatments, guestCount, primaryTherapistId, rosterIds]);

  const groups = useMemo<TherapistGroup[]>(() => {
    const order: (string | null)[] = [];
    const byId = new Map<string | null, TherapistGroup>();

    serviceTreatments.forEach((t, i) => {
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
  }, [serviceTreatments, lineTherapistIds, nameById, roomName, secondaryRoomName, showEarnings, globalTherapistCommission, therapistCommission, therapistRatesMap, surchargePercent]);

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
    const assignments: LineAssignment[] = serviceTreatments
      .map((t, i) => {
        const bookingTreatmentId = t.bookingTreatmentId;
        if (!bookingTreatmentId) return null;
        const therapistId = bookingTreatmentId === lineId ? pendingTherapistId : lineTherapistIds[i];
        return therapistId ? { bookingTreatmentId, therapistId } : null;
      })
      .filter((a): a is LineAssignment => a !== null);

    try {
      const { becameConfirmed } = await reassign(bookingId, assignments);
      if (becameConfirmed) {
        // Même comportement que le dialog d'édition : la confirmation déclenche
        // les notifications (email client + push thérapeute). Non bloquant.
        try {
          await invokeEdgeFunction("trigger-new-booking-notifications", {
            body: { bookingId },
          });
        } catch (notifError) {
          console.error("Error sending confirmation notifications:", notifError);
        }
      }
      toast.success(becameConfirmed ? "Thérapeute assigné — réservation confirmée." : "Thérapeute réassigné.");
      cancelEdit();
      onReassigned();
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Erreur lors de la réassignation.");
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-stone-100 p-6 shadow-sm">
      <h3 className="text-xs font-semibold tracking-[0.15em] text-gray-400 uppercase mb-4 flex items-center gap-2">
        <HandHeart className="h-4 w-4" /> {hasServices ? `Soins & Praticien${guestCount > 1 ? "s" : ""}` : "Prestations"}
      </h3>

      <div className="space-y-3">
        {groups.map((group, groupIndex) => {
          const accent = group.therapistId
            ? GROUP_ACCENTS[groupIndex % GROUP_ACCENTS.length]
            : UNASSIGNED_ACCENT;
          return (
            <div
              key={group.therapistId ?? "unassigned"}
              className={`rounded-lg border border-gray-100 border-l-2 ${accent.border} bg-gray-50/60 overflow-hidden`}
            >
              {/* En-tête thérapeute */}
              <div className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/40 border-b border-gray-100">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-9 w-9 rounded-full ring-2 ${accent.avatar} flex items-center justify-center font-medium shrink-0`}>
                    {group.therapistName?.charAt(0) || "?"}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{group.therapistName}</p>
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
                      <p className="text-sm font-medium text-amber-700 tabular-nums">{formatPrice(group.earnings, currency)}</p>
                    ) : group.therapistId ? (
                      <button
                        type="button"
                        className="text-[11px] text-amber-600 underline underline-offset-2 hover:text-amber-700"
                        onClick={() => navigate(`/admin/therapists/${group.therapistId}`)}
                        title="Renseigner les tarifs du thérapeute"
                      >
                        Compléter les tarifs
                      </button>
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
                    <div key={lineId || i} className={`px-4 py-2.5 transition-colors ${isEditingLine ? "bg-blue-50/50" : ""}`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm min-w-0 flex flex-col">
                          <span>{line.name}</span>
                          {line.duration ? (
                            <span className="text-xs text-muted-foreground">{line.duration} min</span>
                          ) : null}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-medium whitespace-nowrap">
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

        {/* Accès / commodités : lignes amenity (piscine, sauna…), sans praticien
            ni cabine ni réassignation — la disponibilité dépend de la commodité. */}
        {amenityTreatments.length > 0 && (
          <div className="rounded-lg border border-gray-100 border-l-2 border-l-cyan-300 bg-gray-50/60 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-muted/40 border-b border-gray-100">
              <div className="h-9 w-9 rounded-full ring-2 bg-cyan-50 text-cyan-700 ring-cyan-200 flex items-center justify-center shrink-0">
                <Waves className="h-4 w-4" />
              </div>
              <p className="font-medium text-sm">Accès / commodités</p>
            </div>
            <div className="divide-y divide-gray-100">
              {amenityTreatments.map((line, i) => {
                const typeDef = line.amenity_type ? getAmenityType(line.amenity_type) : undefined;
                const amenityLabel = typeDef?.labelFr ?? line.amenity_name ?? null;
                return (
                  <div key={line.bookingTreatmentId || i} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm min-w-0 flex flex-col">
                        <span>{line.name}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                          {amenityLabel && (
                            <span className="inline-flex items-center gap-1">
                              {typeDef?.icon && <typeDef.icon className="h-3 w-3" />}
                              {amenityLabel}
                            </span>
                          )}
                          {line.duration ? <span>· {line.duration} min</span> : null}
                        </span>
                      </span>
                      <span className="text-sm font-medium whitespace-nowrap shrink-0">
                        {formatPrice(line.price ?? 0, currency)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
