import { EntityDetailDialog } from "./EntityDetailDialog";
import { DetailSection, DetailCard, DetailField } from "./DetailSection";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Briefcase, Building2, Calendar, User } from "lucide-react";

interface Hotel {
  id: string;
  name: string;
  image: string | null;
}

interface Trunk {
  id: string;
  name: string;
  trunk_model: string | null;
  image: string | null;
  hotel_id: string | null;
  hairdresser_name: string | null;
  status: string;
  created_at?: string;
}

interface TrunkDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trunk: Trunk | null;
  hotel: Hotel | null;
  nextBooking: string | null;
  onEdit?: () => void;
}

export function TrunkDetailDialog({
  open,
  onOpenChange,
  trunk,
  hotel,
  nextBooking,
  onEdit,
}: TrunkDetailDialogProps) {
  if (!trunk) return null;

  const formatNextBooking = (dateTime: string | null) => {
    if (!dateTime) return null;
    return new Date(dateTime).toLocaleString("fr-FR", {
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
      title={trunk.name}
      image={trunk.image}
      emoji="🧳"
      status={trunk.status}
    >
      {/* Details */}
      <DetailSection icon={Briefcase} title="Details">
        <DetailCard>
          <div className="space-y-2">
            <DetailField label="Modele" value={trunk.trunk_model || "-"} />
            <DetailField label="ID" value={trunk.id} muted />
          </div>
        </DetailCard>
      </DetailSection>

      {/* Assignment */}
      <DetailSection icon={Building2} title="Assignation">
        <DetailCard>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Hotel</p>
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
                <p className="text-sm text-muted-foreground">Non assigne</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Coiffeur</p>
              {trunk.hairdresser_name ? (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{trunk.hairdresser_name}</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Non assigne</p>
              )}
            </div>
          </div>
        </DetailCard>
      </DetailSection>

      {/* Schedule */}
      <DetailSection icon={Calendar} title="Planning" showSeparator={false}>
        <DetailCard>
          <DetailField
            label="Prochaine reservation"
            value={formatNextBooking(nextBooking) || "Aucune reservation"}
            muted={!nextBooking}
          />
        </DetailCard>
      </DetailSection>
    </EntityDetailDialog>
  );
}
