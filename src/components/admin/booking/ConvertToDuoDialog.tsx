import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Users, Check, Loader2, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useAvailableTherapistsForSlot } from "@/hooks/booking/useAvailableTherapistsForSlot";
import { useAvailableRooms } from "@/hooks/booking/useAvailableRooms";
import { useConvertToDuoMutation, type ConvertAssignment } from "@/hooks/booking/useConvertToDuoMutation";
import type { BookingListItem } from "@shared/db";
import type { Therapist } from "@/hooks/booking/useBookingData";

interface ConvertToDuoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: BookingListItem;
  therapists: Therapist[] | undefined;
  onSuccess: () => void;
}

export function ConvertToDuoDialog({
  open,
  onOpenChange,
  booking,
  therapists,
  onSuccess,
}: ConvertToDuoDialogProps) {
  const { t } = useTranslation("admin");

  const treatments = useMemo(() => booking.treatments ?? [], [booking.treatments]);
  const guestCount = treatments.length;
  const newDuration = useMemo(() => {
    const durations = treatments.map((tr) => tr.duration ?? 0).filter((d) => d > 0);
    return durations.length > 0 ? Math.max(...durations) : booking.duration ?? 60;
  }, [treatments, booking.duration]);
  const treatmentIds = useMemo(
    () => treatments.map((tr) => tr.treatment_id).filter((id): id is string => !!id),
    [treatments],
  );

  const [mode, setMode] = useState<"assign" | "broadcast">("assign");
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [secondaryRoomEnabled, setSecondaryRoomEnabled] = useState(false);
  const [secondaryRoomId, setSecondaryRoomId] = useState<string>("");

  // Reset state each time the dialog opens: first soin pre-filled with the
  // current primary therapist (if any).
  useEffect(() => {
    if (!open) return;
    setMode("assign");
    const initial: Record<string, string> = {};
    const firstLineId = treatments[0]?.bookingTreatmentId;
    if (firstLineId && booking.therapist_id) initial[firstLineId] = booking.therapist_id;
    setAssignments(initial);
    setSecondaryRoomEnabled(false);
    setSecondaryRoomId("");
  }, [open, booking.id, booking.therapist_id, treatments]);

  const bookingDate = booking.booking_date ? new Date(booking.booking_date) : undefined;

  const { data: available = [] } = useAvailableTherapistsForSlot({
    hotelId: booking.hotel_id,
    date: bookingDate,
    time: booking.booking_time ?? "",
    durationMinutes: newDuration,
    treatmentIds,
    excludeBookingId: booking.id,
  });

  const { rooms, occupiedRoomIds } = useAvailableRooms(
    booking.hotel_id ?? undefined,
    booking.booking_date ?? undefined,
    booking.booking_time ?? undefined,
    booking.id,
  );

  const mutation = useConvertToDuoMutation(booking, () => {
    onSuccess();
    onOpenChange(false);
  });

  // Name lookup: prefer the venue therapists list, fall back to the availability
  // rows (so a pre-selected therapist still resolves a name).
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of available) map.set(a.id, `${a.first_name} ${a.last_name}`.trim());
    for (const th of therapists ?? []) map.set(th.id, `${th.first_name} ${th.last_name}`.trim());
    return map;
  }, [available, therapists]);

  const selectedIds = useMemo(() => Object.values(assignments).filter(Boolean), [assignments]);
  const hasDuplicate = new Set(selectedIds).size !== selectedIds.length;
  const allAssigned = treatments.every((tr) => tr.bookingTreatmentId && assignments[tr.bookingTreatmentId]);

  const secondaryRoomOptions = rooms.filter((r) => r.id !== booking.room_id);
  const secondaryRoomOccupied = secondaryRoomId ? occupiedRoomIds.has(secondaryRoomId) : false;

  const handlePick = (bookingTreatmentId: string, therapistId: string) => {
    setAssignments((prev) => ({ ...prev, [bookingTreatmentId]: therapistId }));
  };

  const canSubmit =
    !mutation.isPending &&
    (mode === "broadcast" || (allAssigned && !hasDuplicate));

  const handleSubmit = () => {
    if (mode === "assign") {
      const list: ConvertAssignment[] = treatments
        .map((tr) =>
          tr.bookingTreatmentId && assignments[tr.bookingTreatmentId]
            ? { bookingTreatmentId: tr.bookingTreatmentId, therapistId: assignments[tr.bookingTreatmentId] }
            : null,
        )
        .filter((a): a is ConvertAssignment => a !== null);
      const primaryTherapistName = list[0] ? nameById.get(list[0].therapistId) ?? null : null;
      mutation.mutate({
        mode: "assign",
        assignments: list,
        primaryTherapistName,
        secondaryRoomId: secondaryRoomEnabled ? secondaryRoomId || null : null,
      });
    } else {
      mutation.mutate({
        mode: "broadcast",
        secondaryRoomId: secondaryRoomEnabled ? secondaryRoomId || null : null,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> {t("booking.convertToDuo.title")}
          </DialogTitle>
          <DialogDescription>
            {t("booking.convertToDuo.description", { count: guestCount })}
          </DialogDescription>
        </DialogHeader>

        {/* Mode toggle (lightweight broadcast card) */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("assign")}
            className={cn(
              "rounded-lg border p-3 text-left text-sm transition-colors",
              mode === "assign" ? "border-primary bg-primary/5" : "hover:bg-muted border-border",
            )}
          >
            <span className="font-medium">{t("booking.convertToDuo.modeAssignTitle")}</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("broadcast")}
            className={cn(
              "rounded-lg border p-3 text-left text-sm transition-colors flex items-center justify-between gap-2",
              mode === "broadcast" ? "border-primary bg-primary/5" : "hover:bg-muted border-border",
            )}
          >
            <span className="font-medium">{t("booking.convertToDuo.modeBroadcastTitle")}</span>
            {mode === "broadcast" && <Check className="h-4 w-4 shrink-0 text-primary" />}
          </button>
        </div>

        {mode === "assign" ? (
          <div className="space-y-3">
            {treatments.map((tr, idx) => {
              const lineId = tr.bookingTreatmentId ?? "";
              const currentId = assignments[lineId] ?? "";
              // Exclude therapists picked on the other soins (parallel → distinct).
              const otherIds = new Set(
                treatments
                  .filter((_, i) => i !== idx)
                  .map((o) => (o.bookingTreatmentId ? assignments[o.bookingTreatmentId] : ""))
                  .filter(Boolean),
              );
              // Options = available minus those taken elsewhere; always keep the
              // current selection (safety net even if it dropped out of availability).
              const options = available.filter((a) => !otherIds.has(a.id) || a.id === currentId);
              const currentInOptions = options.some((o) => o.id === currentId);

              return (
                <div key={lineId || idx} className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    {t("booking.convertToDuo.treatmentPickerLabel", {
                      name: tr.name,
                      duration: tr.duration ?? 0,
                    })}
                  </Label>
                  <Select value={currentId} onValueChange={(v) => handlePick(lineId, v)} disabled={!lineId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("booking.convertToDuo.noTherapistAvailable")} />
                    </SelectTrigger>
                    <SelectContent>
                      {!currentInOptions && currentId && (
                        <SelectItem value={currentId}>
                          {nameById.get(currentId) ?? currentId}
                        </SelectItem>
                      )}
                      {options.length === 0 && !currentId ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          {t("booking.convertToDuo.noTherapistAvailable")}
                        </div>
                      ) : (
                        options.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.first_name} {a.last_name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
            {hasDuplicate && (
              <p className="text-xs text-red-600">
                {t("booking.convertToDuo.duplicateWarning", {
                  defaultValue: "Un praticien ne peut pas faire deux soins en parallèle.",
                })}
              </p>
            )}
          </div>
        ) : (
          <p className="rounded-lg bg-muted/50 border p-3 text-xs text-muted-foreground">
            {t("booking.convertToDuo.modeBroadcastHelper")}
          </p>
        )}

        {/* Secondary room */}
        {booking.room_id && secondaryRoomOptions.length > 0 && (
          <div className="space-y-2 rounded-lg border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={secondaryRoomEnabled}
                onCheckedChange={(c) => setSecondaryRoomEnabled(c === true)}
              />
              {t("booking.convertToDuo.secondaryRoomLabel")}
            </label>
            {secondaryRoomEnabled && (
              <>
                <Select value={secondaryRoomId} onValueChange={setSecondaryRoomId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("booking.convertToDuo.secondaryRoomLabel")} />
                  </SelectTrigger>
                  <SelectContent>
                    {secondaryRoomOptions.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {secondaryRoomOccupied && (
                  <p className="flex items-center gap-1.5 text-xs text-amber-600">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {t("booking.convertToDuo.roomCapacityWarning")}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {t("booking.convertToDuo.durationHelper", { duration: newDuration })}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t("booking.convertToDuo.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === "assign"
              ? t("booking.convertToDuo.submitAssign")
              : t("booking.convertToDuo.submitBroadcast")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
