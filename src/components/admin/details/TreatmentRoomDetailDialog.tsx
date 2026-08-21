import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { EntityDetailDialog } from "./EntityDetailDialog";
import { DetailSection, DetailCard, DetailField } from "./DetailSection";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DoorOpen, Building2, Calendar } from "lucide-react";

interface Hotel {
  id: string;
  name: string;
  image: string | null;
}

interface TreatmentRoom {
  id: string;
  name: string;
  room_type: string | null;
  image: string | null;
  hotel_id: string | null;
  status: string;
  capacity?: number;
  created_at?: string;
}

interface TreatmentRoomDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: TreatmentRoom | null;
  hotel: Hotel | null;
  nextBooking: string | null;
  onEdit?: () => void;
}

export function TreatmentRoomDetailDialog({
  open,
  onOpenChange,
  room,
  hotel,
  nextBooking,
  onEdit,
}: TreatmentRoomDetailDialogProps) {
  const { t } = useTranslation(["admin", "common"]);
  if (!room) return null;

  const formatNextBooking = (dateTime: string | null) => {
    if (!dateTime) return null;
    return new Date(dateTime).toLocaleString(i18n.language, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <EntityDetailDialog
      open={open}
      onOpenChange={onOpenChange}
      onEdit={onEdit}
      title={room.name}
      image={room.image}
      emoji="🚪"
      status={room.status}
    >
      {/* Details */}
      <DetailSection icon={DoorOpen} title={t("treatmentRoomDialog.details")}>
        <DetailCard>
          <div className="space-y-2">
            <DetailField label="Type" value={room.room_type || "-"} />
            <DetailField
              label={t("treatmentRoomDialog.beds")}
              value={String(room.capacity ?? 1)}
            />
            <DetailField label="ID" value={room.id} muted />
          </div>
        </DetailCard>
      </DetailSection>

      {/* Assignment */}
      <DetailSection icon={Building2} title={t("treatmentRoomDialog.assignment")}>
        <DetailCard>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                {t("treatmentRoomDialog.venue")}
              </p>
              {hotel ? (
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={hotel.image || undefined} />
                    <AvatarFallback className="text-xs">
                      {hotel.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{hotel.name}</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("treatmentRoomDialog.unassigned")}
                </p>
              )}
            </div>
          </div>
        </DetailCard>
      </DetailSection>

      {/* Schedule */}
      <DetailSection icon={Calendar} title={t("treatmentRoomDialog.planning")} showSeparator={false}>
        <DetailCard>
          <DetailField
            label={t("treatmentRoomDialog.nextBooking")}
            value={formatNextBooking(nextBooking) || t("treatmentRoomDialog.noBooking")}
            muted={!nextBooking}
          />
        </DetailCard>
      </DetailSection>
    </EntityDetailDialog>
  );
}
