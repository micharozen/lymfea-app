import { EntityDetailDialog } from "./EntityDetailDialog";
import { DetailSection, DetailCard, DetailField } from "./DetailSection";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Phone, Building2 } from "lucide-react";

interface Hotel {
  id: string;
  name: string;
  image: string | null;
}

interface Concierge {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  country_code: string;
  hotel_id: string | null;
  profile_image: string | null;
  status: string;
  hotels?: { hotel_id: string }[];
}

interface ConciergeDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  concierge: Concierge | null;
  hotels: Hotel[];
  onEdit?: () => void;
}

export function ConciergeDetailDialog({
  open,
  onOpenChange,
  concierge,
  hotels,
  onEdit,
}: ConciergeDetailDialogProps) {
  if (!concierge) return null;

  const fullName = `${concierge.first_name} ${concierge.last_name}`;

  const assignedHotels = concierge.hotels
    ?.map((h) => hotels.find((hotel) => hotel.id === h.hotel_id))
    .filter(Boolean) as Hotel[] || [];

  return (
    <EntityDetailDialog
      open={open}
      onOpenChange={onOpenChange}
      onEdit={onEdit}
      title={fullName}
      image={concierge.profile_image}
      status={concierge.status}
    >
      {/* Contact */}
      <DetailSection icon={Phone} title="Contact">
        <DetailCard>
          <div className="space-y-2">
            <DetailField label="Email" value={concierge.email} />
            <DetailField
              label="Telephone"
              value={`${concierge.country_code} ${concierge.phone}`}
            />
          </div>
        </DetailCard>
      </DetailSection>

      {/* Hotels */}
      <DetailSection icon={Building2} title={`Hotels (${assignedHotels.length})`} showSeparator={false}>
        {assignedHotels.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {assignedHotels.map((hotel) => (
              <div
                key={hotel.id}
                className="flex items-center gap-2 bg-muted/50 rounded-full pl-1 pr-3 py-1"
              >
                <Avatar className="h-6 w-6">
                  <AvatarImage src={hotel.image || undefined} />
                  <AvatarFallback className="text-xs">
                    {hotel.name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm">{hotel.name}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucun hotel assigne</p>
        )}
      </DetailSection>
    </EntityDetailDialog>
  );
}
