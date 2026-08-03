import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCreateRoomBlock, useUpdateRoomBlock, type RoomBlockRow } from "@/hooks/booking";
import { Input } from "@/components/ui/input";
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
  /**
   * Occurrence à éditer (une ligne, pas la série). Le composant lit ses props
   * une seule fois à l'initialisation de son état : le parent doit lui passer
   * une `key` qui change avec le blocage édité.
   */
  block?: RoomBlockRow;
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
  block,
}: RoomBlockDialogProps) {
  const { t } = useTranslation("admin");
  const createBlock = useCreateRoomBlock();
  const updateBlock = useUpdateRoomBlock();
  const isEdit = !!block;
  const pending = createBlock.isPending || updateBlock.isPending;

  const initialDate = block?.block_date || defaultDate || todayIso();
  const [label, setLabel] = useState(block?.label ?? "");
  const [startDate, setStartDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(block?.start_time.substring(0, 5) ?? "08:00");
  const [endTime, setEndTime] = useState(block?.end_time.substring(0, 5) ?? "12:00");
  const [wholeVenue, setWholeVenue] = useState(block ? block.room_id === null : true);
  const [roomIds, setRoomIds] = useState<string[]>(block?.room_id ? [block.room_id] : []);

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
    const payload = {
      venueId: hotelId,
      label: label.trim(),
      startDate,
      endDate,
      startTime,
      endTime,
      roomIds: wholeVenue ? [] : roomIds,
    };
    if (block) {
      await updateBlock.mutateAsync({ rowId: block.id, payload });
    } else {
      await createBlock.mutateAsync(payload);
      reset();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="app-refonte rb-dialog sm:max-w-lg">
        <DialogHeader className="rb-hdr">
          <DialogTitle>
            {isEdit ? t("roomBlocks.editTitle") : t("roomBlocks.dialogTitle")}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? t("roomBlocks.editDescription") : t("roomBlocks.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="rb-body">
          <div className="rb-field">
            <label className="rb-lbl" htmlFor="room-block-label">
              {t("roomBlocks.labelField")}
            </label>
            <Input
              id="room-block-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("roomBlocks.labelPlaceholder")}
            />
          </div>

          <div className="rb-grid">
            <div className="rb-field">
              <label className="rb-lbl" htmlFor="room-block-start-date">
                {t("roomBlocks.startDate")}
              </label>
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
            <div className="rb-field">
              <label className="rb-lbl" htmlFor="room-block-end-date">
                {t("roomBlocks.endDate")}
              </label>
              <Input
                id="room-block-end-date"
                type="date"
                min={startDate}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="rb-grid">
            <div className="rb-field">
              <span className="rb-lbl">{t("roomBlocks.startTime")}</span>
              <SelectField
                options={TIME_OPTIONS}
                value={startTime}
                onChange={setStartTime}
                searchable={false}
                aria-label={t("roomBlocks.startTime")}
              />
            </div>
            <div className="rb-field">
              <span className="rb-lbl">{t("roomBlocks.endTime")}</span>
              <SelectField
                options={TIME_OPTIONS}
                value={endTime}
                onChange={setEndTime}
                searchable={false}
                aria-label={t("roomBlocks.endTime")}
              />
            </div>
          </div>
          {!timesValid && <p className="rb-err">{t("roomBlocks.invalidTimeRange")}</p>}

          <div className="rb-field">
            <span className="rb-lbl">{t("roomBlocks.scope")}</span>
            <div className="rb-check">
              <Checkbox
                id="room-block-whole-venue"
                checked={wholeVenue}
                onCheckedChange={(checked) => setWholeVenue(checked === true)}
              />
              <label htmlFor="room-block-whole-venue">{t("roomBlocks.wholeVenue")}</label>
            </div>
            {!wholeVenue && (
              <div className="rb-rooms">
                {roomOptions.length === 0 && (
                  <p className="empty">{t("roomBlocks.noRooms")}</p>
                )}
                {roomOptions.map((room) => (
                  <div key={room.id} className="rb-check">
                    <Checkbox
                      id={`room-block-${room.id}`}
                      checked={roomIds.includes(room.id)}
                      onCheckedChange={(checked) => toggleRoom(room.id, checked === true)}
                    />
                    <label htmlFor={`room-block-${room.id}`}>{room.name}</label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!!overlappingCount && overlappingCount > 0 && (
            <div className="rb-warn">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{t("roomBlocks.existingBookingsWarning", { count: overlappingCount })}</span>
            </div>
          )}
        </div>

        <DialogFooter className="rb-ftr">
          <button type="button" className="rb-btn" onClick={() => onOpenChange(false)}>
            {t("roomBlocks.cancel")}
          </button>
          <button
            type="button"
            className="rb-btn primary"
            onClick={handleSubmit}
            disabled={!canSubmit || pending}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? t("roomBlocks.save") : t("roomBlocks.submit")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
