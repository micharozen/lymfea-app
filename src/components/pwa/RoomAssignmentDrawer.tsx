import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useBookingRoomOptions } from "@/hooks/pwa/useBookingRoomOptions";

interface RoomAssignmentDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  currentRoomId: string | null;
  currentSecondaryRoomId: string | null;
  /** Un duo/trio peut occuper deux salles quand la capacité d'une seule ne suffit pas. */
  guestCount: number;
  onRoomsUpdated: () => void;
}

const ROOM_ERROR_KEYS: Record<string, string> = {
  ROOM_ALREADY_BOOKED: "roomAlreadyBooked",
  ROOM_NOT_IN_VENUE: "roomNotInVenue",
  SECONDARY_ROOM_WITHOUT_PRIMARY: "roomSecondaryWithoutPrimary",
  FORBIDDEN: "roomForbidden",
};

export const RoomAssignmentDrawer = ({
  open,
  onOpenChange,
  bookingId,
  currentRoomId,
  currentSecondaryRoomId,
  guestCount,
  onRoomsUpdated,
}: RoomAssignmentDrawerProps) => {
  const { t } = useTranslation("pwa");
  const queryClient = useQueryClient();
  const [roomId, setRoomId] = useState<string | null>(currentRoomId);
  const [secondaryRoomId, setSecondaryRoomId] = useState<string | null>(currentSecondaryRoomId);
  const [saving, setSaving] = useState(false);

  // Réaligne la sélection sur la réservation à chaque ouverture.
  useEffect(() => {
    if (open) {
      setRoomId(currentRoomId);
      setSecondaryRoomId(currentSecondaryRoomId);
    }
  }, [open, currentRoomId, currentSecondaryRoomId]);

  const { data: rooms = [], isLoading } = useBookingRoomOptions(bookingId, open);

  const canUseSecondary = guestCount > 1;
  const dirty = roomId !== currentRoomId || secondaryRoomId !== currentSecondaryRoomId;

  const handleSelectPrimary = (id: string) => {
    setRoomId(id);
    // La même salle ne peut pas être à la fois principale et secondaire.
    if (secondaryRoomId === id) setSecondaryRoomId(null);
  };

  const handleSelectSecondary = (id: string) => {
    setSecondaryRoomId(secondaryRoomId === id ? null : id);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("set_booking_rooms", {
        _booking_id: bookingId,
        _room_id: roomId,
        _secondary_room_id: canUseSecondary && secondaryRoomId ? secondaryRoomId : undefined,
      });
      if (error) throw error;

      toast.success(t("bookingDetail.roomUpdated", "Salle mise à jour"));
      await queryClient.invalidateQueries({ queryKey: ["pwa-booking-room-options", bookingId] });
      onOpenChange(false);
      onRoomsUpdated();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const key = Object.keys(ROOM_ERROR_KEYS).find((code) => message.includes(code));
      toast.error(
        key
          ? t(`bookingDetail.${ROOM_ERROR_KEYS[key]}`)
          : t("bookingDetail.roomUpdateError", "Impossible de modifier la salle"),
      );
    } finally {
      setSaving(false);
    }
  };

  const renderRoomList = (selectedId: string | null, onSelect: (id: string) => void, excludeId?: string | null) => (
    <div className="space-y-2">
      {rooms
        .filter((room) => room.id !== excludeId)
        .map((room) => {
          const selected = room.id === selectedId;
          // Une salle déjà assignée à cette réservation reste sélectionnable.
          const assignedHere = room.id === currentRoomId || room.id === currentSecondaryRoomId;
          const disabled = room.is_occupied && !assignedHere;

          return (
            <button
              key={room.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(room.id)}
              className={`w-full flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                selected ? "border-primary bg-primary/5" : "border-border"
              } ${disabled ? "opacity-50" : ""}`}
            >
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate">{room.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {room.room_number}
                  {room.capacity > 1 && ` · ${t("bookingDetail.roomCapacity", { count: room.capacity })}`}
                  {disabled && ` · ${t("bookingDetail.roomOccupied", "Occupée")}`}
                </span>
                {!disabled && room.turnover_conflict && (
                  <span className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                    <TriangleAlert size={12} />
                    {t("bookingDetail.roomTurnoverTight", "Temps de remise en état serré")}
                  </span>
                )}
              </span>
              {selected && <Check size={18} className="text-primary shrink-0" />}
            </button>
          );
        })}
    </div>
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="app-refonte pb-safe max-h-[90vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-lg font-normal">
            {t("bookingDetail.roomAssignTitle", "Salle de soin")}
          </DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-4 space-y-4 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rooms.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("bookingDetail.roomNone", "Aucune salle disponible sur ce lieu")}
            </p>
          ) : (
            <>
              {canUseSecondary && (
                <p className="text-xs text-muted-foreground">
                  {t("bookingDetail.roomPrimaryLabel", "Salle principale")}
                </p>
              )}
              {renderRoomList(roomId, handleSelectPrimary)}

              {canUseSecondary && (
                <>
                  <p className="pt-2 text-xs text-muted-foreground">
                    {t("bookingDetail.roomSecondaryLabel", "Salle secondaire (optionnelle)")}
                  </p>
                  {renderRoomList(secondaryRoomId, handleSelectSecondary, roomId)}
                </>
              )}
            </>
          )}
        </div>

        <DrawerFooter className="pt-2">
          <Button onClick={handleSave} disabled={saving || isLoading || !roomId || !dirty} className="w-full">
            {saving ? t("bookingDetail.roomSaving", "Enregistrement…") : t("bookingDetail.roomSave", "Enregistrer")}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common:buttons.cancel", "Annuler")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};
