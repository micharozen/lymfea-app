import { EntityDetailDialog } from "./EntityDetailDialog";
import { DetailSection, DetailCard, DetailField } from "./DetailSection";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Phone, Building2, Sparkles, Briefcase } from "lucide-react";

interface Hotel {
  id: string;
  name: string;
  image: string | null;
}

interface Trunk {
  id: string;
  name: string;
  image: string | null;
}

interface HairDresser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  country_code: string;
  phone: string;
  profile_image: string | null;
  status: string;
  trunks: string | null;
  skills: string[];
  hairdresser_hotels?: { hotel_id: string }[];
}

interface HairdresserDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hairdresser: HairDresser | null;
  hotels: Hotel[];
  trunks: Trunk[];
  onEdit?: () => void;
}

export function HairdresserDetailDialog({
  open,
  onOpenChange,
  hairdresser,
  hotels,
  trunks,
  onEdit,
}: HairdresserDetailDialogProps) {
  if (!hairdresser) return null;

  const fullName = `${hairdresser.first_name} ${hairdresser.last_name}`;

  const assignedHotels = hairdresser.hairdresser_hotels
    ?.map((h) => hotels.find((hotel) => hotel.id === h.hotel_id))
    .filter(Boolean) as Hotel[] || [];

  const getSkillsDisplay = (skills: string[]) => {
    if (!skills || skills.length === 0) return null;

    const skillMap: Record<string, { emoji: string; label: string }> = {
      men: { emoji: "👨", label: "Homme" },
      women: { emoji: "👩", label: "Femme" },
      barber: { emoji: "💈", label: "Barbier" },
      beauty: { emoji: "💅", label: "Beaute" },
    };

    return skills
      .map((skill) => skillMap[skill])
      .filter(Boolean);
  };

  const getTrunkInfo = (trunkIdOrName: string | null) => {
    if (!trunkIdOrName) return null;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trunkIdOrName);

    if (isUuid) {
      return trunks.find((t) => t.id === trunkIdOrName) || null;
    }

    return null;
  };

  const assignedTrunk = getTrunkInfo(hairdresser.trunks);
  const skillsDisplay = getSkillsDisplay(hairdresser.skills);

  return (
    <EntityDetailDialog
      open={open}
      onOpenChange={onOpenChange}
      onEdit={onEdit}
      title={fullName}
      image={hairdresser.profile_image}
      status={hairdresser.status}
    >
      {/* Contact */}
      <DetailSection icon={Phone} title="Contact">
        <DetailCard>
          <div className="space-y-2">
            <DetailField label="Email" value={hairdresser.email} />
            <DetailField
              label="Telephone"
              value={`${hairdresser.country_code} ${hairdresser.phone}`}
            />
          </div>
        </DetailCard>
      </DetailSection>

      {/* Skills */}
      {skillsDisplay && skillsDisplay.length > 0 && (
        <DetailSection icon={Sparkles} title="Competences">
          <div className="flex flex-wrap gap-2">
            {skillsDisplay.map((skill, index) => (
              <div
                key={index}
                className="flex items-center gap-2 bg-muted/50 rounded-full px-3 py-1"
              >
                <span>{skill.emoji}</span>
                <span className="text-sm">{skill.label}</span>
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      {/* Hotels */}
      <DetailSection icon={Building2} title={`Hotels (${assignedHotels.length})`}>
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

      {/* Trunk */}
      <DetailSection icon={Briefcase} title="Malle" showSeparator={false}>
        {assignedTrunk ? (
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 w-fit">
            {assignedTrunk.image ? (
              <img
                src={assignedTrunk.image}
                alt={assignedTrunk.name}
                className="w-6 h-6 rounded object-cover"
              />
            ) : (
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">{assignedTrunk.name}</span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune malle assignee</p>
        )}
      </DetailSection>
    </EntityDetailDialog>
  );
}
