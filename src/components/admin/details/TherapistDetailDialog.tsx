import { EntityDetailDialog } from "./EntityDetailDialog";
import { DetailSection, DetailCard, DetailField } from "./DetailSection";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Phone, Building2, Sparkles, Target, CalendarDays } from "lucide-react";
import { MinimumGuaranteeEditor } from "@/components/admin/MinimumGuaranteeEditor";
import { TherapistScheduleSection } from "@/components/admin/schedule/TherapistScheduleSection";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Hotel {
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
  minimum_guarantee?: Record<string, number> | null;
  therapist_venues?: { hotel_id: string }[];
}

interface TherapistDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  therapist: Therapist | null;
  hotels: Hotel[];
  onEdit?: () => void;
}

export function TherapistDetailDialog({
  open,
  onOpenChange,
  therapist,
  hotels,
  onEdit,
}: TherapistDetailDialogProps) {

  const { data: treatmentNames = [] } = useQuery({
    queryKey: ["therapist-treatment-names", therapist?.id],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("therapist_treatments")
        .select("treatment_menus(name)")
        .eq("therapist_id", therapist!.id);
      if (error) throw error;
      return (data ?? [])
        .map((row) => row.treatment_menus?.name)
        .filter((name): name is string => !!name);
    },
    enabled: open && !!therapist?.id,
  });

  if (!therapist) return null;

  const fullName = `${therapist.first_name} ${therapist.last_name}`;

  const assignedHotels = therapist.therapist_venues
    ?.map((h) => hotels.find((hotel) => hotel.id === h.hotel_id))
    .filter(Boolean) as Hotel[] || [];


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

      {treatmentNames.length > 0 && (
        <DetailSection icon={Sparkles} title="Prestations réalisables">
          <div className="flex flex-wrap gap-2">
            {treatmentNames.map((name) => (
              <div
                key={name}
                className="flex items-center gap-2 bg-muted/50 rounded-full px-3 py-1"
              >
                <span className="text-sm">{name}</span>
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
      <DetailSection icon={CalendarDays} title="Planning" showSeparator={false}>
        <TherapistScheduleSection therapistId={therapist.id} />
      </DetailSection>
    </EntityDetailDialog>
  );
}
