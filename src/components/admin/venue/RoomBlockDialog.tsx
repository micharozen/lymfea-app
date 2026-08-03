import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCreateRoomBlock } from "@/hooks/booking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectField } from "@/components/ui/select-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RoomBlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hotelId: string;
  /** Date préremplie (YYYY-MM-DD), typiquement celle affichée sur le planning. */
  defaultDate?: string;
}

const ACTIVE_STATUSES = ["active", "actif"];

/** Créneaux de 30 min sur 24 h. */
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const value = `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 === 0 ? "00" : "30"}`;
  return { value, label: value };
});

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Création d'un blocage ponctuel daté : une plage horaire neutralisée sur une
 * ou plusieurs salles (ou tout le lieu), sans booking associé.
 */
export function RoomBlockDialog({
  open,
  onOpenChange,
  hotelId,
  defaultDate,
}: RoomBlockDialogProps) {
  const { t } = useTranslation("admin");
  const createBlock = useCreateRoomBlock();

  const initialDate = defaultDate || todayIso();
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(initialDate);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("12:00");
  const [wholeVenue, setWholeVenue] = useState(true);
  const [roomIds, setRoomIds] = useState<string[]>([]);

  const { data: rooms } = useQuery({
    queryKey: ["treatment-rooms", "active", hotelId],
    enabled: open && !!hotelId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatment_rooms")
        .select("id, name, status")
        .eq("hotel_id", hotelId)
        .order("name");
      if (error) throw error;
      return (data || []).filter((r) => ACTIVE_STATUSES.includes((r.status || "").toLowerCase()));
    },
  });

  const datesValid = endDate >= startDate;
  const timesValid = endTime > startTime;
  const selectionValid = wholeVenue || roomIds.length > 0;
  const canSubmit = !!label.trim() && datesValid && timesValid && selectionValid;

  // Avertissement non bloquant : le blocage n'annule aucune réservation existante.
  const { data: overlappingCount } = useQuery({
    queryKey: ["room-blocks", "overlapping", hotelId, startDate, endDate, startTime, endTime],
    enabled: open && !!hotelId && datesValid && timesValid,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, booking_time, room_id")
        .eq("hotel_id", hotelId)
        .gte("booking_date", startDate)
        .lte("booking_date", endDate)
        .not("status", "in", '("Annulé","Terminé","cancelled","completed","noshow")');
      if (error) throw error;
      return (data || []).filter((b) => {
        const time = (b.booking_time || "").substring(0, 5);
        return time >= startTime && time < endTime;
      }).length;
    },
  });

  const roomOptions = useMemo(() => rooms || [], [rooms]);

  const toggleRoom = (roomId: string, checked: boolean) => {
    setRoomIds((prev) => (checked ? [...prev, roomId] : prev.filter((id) => id !== roomId)));
  };

  const reset = () => {
    setLabel("");
    setStartDate(initialDate);
    setEndDate(initialDate);
    setStartTime("08:00");
    setEndTime("12:00");
    setWholeVenue(true);
    setRoomIds([]);
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error(t("roomBlocks.invalidForm"));
      return;
    }
    await createBlock.mutateAsync({
      venueId: hotelId,
      label: label.trim(),
      startDate,
      endDate,
      startTime,
      endTime,
      roomIds: wholeVenue ? [] : roomIds,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("roomBlocks.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("roomBlocks.dialogDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="room-block-label">{t("roomBlocks.labelField")}</Label>
            <Input
              id="room-block-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("roomBlocks.labelPlaceholder")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="room-block-start-date">{t("roomBlocks.startDate")}</Label>
              <Input
                id="room-block-start-date"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (endDate < e.target.value) setEndDate(e.target.value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="room-block-end-date">{t("roomBlocks.endDate")}</Label>
              <Input
                id="room-block-end-date"
                type="date"
                min={startDate}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("roomBlocks.startTime")}</Label>
              <SelectField
                options={TIME_OPTIONS}
                value={startTime}
                onChange={setStartTime}
                searchable={false}
                aria-label={t("roomBlocks.startTime")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("roomBlocks.endTime")}</Label>
              <SelectField
                options={TIME_OPTIONS}
                value={endTime}
                onChange={setEndTime}
                searchable={false}
                aria-label={t("roomBlocks.endTime")}
              />
            </div>
          </div>
          {!timesValid && (
            <p className="text-xs text-destructive">{t("roomBlocks.invalidTimeRange")}</p>
          )}

          <div className="space-y-2">
            <Label>{t("roomBlocks.scope")}</Label>
            <div className="flex items-center gap-2">
              <Checkbox
                id="room-block-whole-venue"
                checked={wholeVenue}
                onCheckedChange={(checked) => setWholeVenue(checked === true)}
              />
              <label htmlFor="room-block-whole-venue" className="text-sm">
                {t("roomBlocks.wholeVenue")}
              </label>
            </div>
            {!wholeVenue && (
              <div className="space-y-2 rounded-md border p-3">
                {roomOptions.length === 0 && (
                  <p className="text-xs text-muted-foreground">{t("roomBlocks.noRooms")}</p>
                )}
                {roomOptions.map((room) => (
                  <div key={room.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`room-block-${room.id}`}
                      checked={roomIds.includes(room.id)}
                      onCheckedChange={(checked) => toggleRoom(room.id, checked === true)}
                    />
                    <label htmlFor={`room-block-${room.id}`} className="text-sm">
                      {room.name}
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!!overlappingCount && overlappingCount > 0 && (
            <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{t("roomBlocks.existingBookingsWarning", { count: overlappingCount })}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("roomBlocks.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || createBlock.isPending}>
            {createBlock.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("roomBlocks.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
