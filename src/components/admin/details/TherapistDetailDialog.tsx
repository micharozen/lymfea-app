import { EntityDetailDialog } from "./EntityDetailDialog";
import { DetailSection, DetailCard, DetailField } from "./DetailSection";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Phone, Building2, Sparkles, Briefcase, Target, CalendarDays } from "lucide-react";
import { MinimumGuaranteeEditor } from "@/components/admin/MinimumGuaranteeEditor";
import { TherapistScheduleSection } from "@/components/admin/schedule/TherapistScheduleSection";

interface Hotel {
  id: string;
  name: string;
  image: string | null;
}

interface TreatmentRoom {
  id: string;
  name: string;
  image: string | null;
}

interface Therapist {
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
  minimum_guarantee?: Record<string, number> | null;
  therapist_venues?: { hotel_id: string }[];
}

interface TherapistDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  therapist: Therapist | null;
  hotels: Hotel[];
  rooms: TreatmentRoom[];
  onEdit?: () => void;
}

export function TherapistDetailDialog({
  open,
  onOpenChange,
  therapist,
  hotels,
  rooms,
  onEdit,
}: TherapistDetailDialogProps) {
  if (!therapist) return null;

  const fullName = `${therapist.first_name} ${therapist.last_name}`;

  const assignedHotels = therapist.therapist_venues
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

  const getRoomInfo = (roomIdOrName: string | null) => {
    if (!roomIdOrName) return null;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomIdOrName);

    if (isUuid) {
      return rooms.find((r) => r.id === roomIdOrName) || null;
    }

    return null;
  };

  const assignedRoom = getRoomInfo(therapist.trunks);
  const skillsDisplay = getSkillsDisplay(therapist.skills);

  return (
    <EntityDetailDialog
      open={open}
      onOpenChange={onOpenChange}
      onEdit={onEdit}
      title={fullName}
      image={therapist.profile_image}
      status={therapist.status}
    >
      {/* Contact */}
      <DetailSection icon={Phone} title="Contact">
        <DetailCard>
          <div className="space-y-2">
            <DetailField label="Email" value={therapist.email} />
            <DetailField
              label="Telephone"
              value={`${therapist.country_code} ${therapist.phone}`}
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

      {/* Minimum Guarantee */}
      {therapist.minimum_guarantee && Object.values(therapist.minimum_guarantee as Record<string, number>).some((v) => v > 0) && (
        <DetailSection icon={Target} title="Minimum garanti">
          <MinimumGuaranteeEditor
            value={therapist.minimum_guarantee as Record<string, number>}
            readOnly
          />
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

      {/* Schedule */}
      <DetailSection icon={CalendarDays} title="Planning">
        <TherapistScheduleSection therapistId={therapist.id} />
      </DetailSection>

      {/* Treatment Room */}
      <DetailSection icon={Briefcase} title="Salle de soin" showSeparator={false}>
        {assignedRoom ? (
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 w-fit">
            {assignedRoom.image ? (
              <img
                src={assignedRoom.image}
                alt={assignedRoom.name}
                className="w-6 h-6 rounded object-cover"
              />
            ) : (
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">{assignedRoom.name}</span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune salle de soin assignee</p>
        )}
      </DetailSection>
    </EntityDetailDialog>
  );
}
