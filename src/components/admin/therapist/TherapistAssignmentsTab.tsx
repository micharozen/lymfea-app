import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MultiSelectPopover, MultiSelectOption } from "@/components/MultiSelectPopover";
import { MinimumGuaranteeEditor } from "@/components/admin/MinimumGuaranteeEditor";
import { Building2, Briefcase, Sparkles, Target } from "lucide-react";
import { TherapistTreatmentsSelector } from "@/components/admin/therapist/TherapistTreatmentsSelector";

interface TherapistAssignmentsTabProps {
  disabled: boolean;
  selectedHotels: string[];
  onHotelsChange: (hotels: string[]) => void;
  selectedRooms: string[];
  onRoomsChange: (rooms: string[]) => void;
  selectedTreatmentIds: string[];
  onTreatmentsChange: (ids: string[]) => void;
  minimumGuarantee: Record<string, number>;
  onMinimumGuaranteeChange: (value: Record<string, number>) => void;
  minimumGuaranteeActive: boolean;
  onMinimumGuaranteeActiveChange: (value: boolean) => void;
}

interface Hotel {
  id: string;
  name: string;
}

interface TreatmentRoom {
  id: string;
  name: string;
}

export function TherapistAssignmentsTab({
  disabled,
  selectedHotels,
  onHotelsChange,
  selectedRooms,
  onRoomsChange,
  selectedTreatmentIds,
  onTreatmentsChange,
  minimumGuarantee,
  onMinimumGuaranteeChange,
  minimumGuaranteeActive,
  onMinimumGuaranteeActiveChange,
}: TherapistAssignmentsTabProps) {
  const { t } = useTranslation("common");
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [rooms, setRooms] = useState<TreatmentRoom[]>([]);

  useEffect(() => {
    fetchHotels();
  }, []);

  useEffect(() => {
    fetchRooms(selectedHotels);
  }, [selectedHotels]);

  const fetchHotels = async () => {
    const { data } = await supabase
      .from("hotels")
      .select("id, name")
      .order("name");
    setHotels(data || []);
  };

  const fetchRooms = async (hotelIds: string[]) => {
    let q = supabase.from("treatment_rooms").select("id, name").order("name");
    if (hotelIds.length > 0) q = q.in("hotel_id", hotelIds);
    const { data } = await q;
    setRooms(data || []);
  };

  const hotelOptions: MultiSelectOption[] = hotels.map((h) => ({
    value: h.id,
    label: h.name,
  }));

  const roomOptions: MultiSelectOption[] = rooms.map((r) => ({
    value: r.id,
    label: r.name,
  }));

  return (
    <div className="space-y-6">
      {/* Venues & Rooms */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            {t("admin:therapists.venuesAndRooms", "Lieux & Salles")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("admin:therapists.venues", "Lieux")}</Label>
              {disabled ? (
                <div className="flex flex-wrap gap-1.5">
                  {selectedHotels.length === 0 ? (
                    <span className="text-sm text-muted-foreground">-</span>
                  ) : (
                    selectedHotels.map((id) => {
                      const hotel = hotels.find((h) => h.id === id);
                      return hotel ? (
                        <span
                          key={id}
                          className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium"
                        >
                          {hotel.name}
                        </span>
                      ) : null;
                    })
                  )}
                </div>
              ) : (
                <MultiSelectPopover
                  placeholder="Sélectionner des lieux"
                  selected={selectedHotels}
                  onChange={onHotelsChange}
                  options={hotelOptions}
                  popoverWidthClassName="w-64"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("admin:therapists.treatmentRooms", "Salles de soin")}</Label>
              {disabled ? (
                <div className="flex flex-wrap gap-1.5">
                  {selectedRooms.length === 0 ? (
                    <span className="text-sm text-muted-foreground">-</span>
                  ) : (
                    selectedRooms.map((id) => {
                      const room = rooms.find((r) => r.id === id);
                      return room ? (
                        <span
                          key={id}
                          className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium"
                        >
                          {room.name}
                        </span>
                      ) : null;
                    })
                  )}
                </div>
              ) : (
                <MultiSelectPopover
                  placeholder="Sélectionner des salles"
                  selected={selectedRooms}
                  onChange={onRoomsChange}
                  options={roomOptions}
                  popoverWidthClassName="w-64"
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Prestations réalisables */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            {t("admin:therapistTreatments.title", "Prestations réalisables")}
          </CardTitle>
          <CardDescription>
            {t(
              "admin:therapistTreatments.description",
              "Sélectionnez les prestations que ce thérapeute peut réaliser. Les add-ons sont exclus : ils sont réalisés par le thérapeute du soin de base."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TherapistTreatmentsSelector
            venues={hotels.filter((h) => selectedHotels.includes(h.id))}
            value={selectedTreatmentIds}
            onChange={onTreatmentsChange}
            disabled={disabled}
          />
        </CardContent>
      </Card>

      {/* Minimum Guarantee */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                {t("admin:therapists.minimumGuarantee", "Minimum garanti")}
              </CardTitle>
              <CardDescription>
                {t(
                  "admin:therapists.minimumGuaranteeDesc",
                  "Nombre minimum de soins quotidiens garantis par jour"
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="mg-active" className="text-xs text-muted-foreground">
                {minimumGuaranteeActive
                  ? t("admin:therapists.active", "Actif")
                  : t("admin:therapists.inactive", "Inactif")}
              </Label>
              <Switch
                id="mg-active"
                checked={minimumGuaranteeActive}
                onCheckedChange={onMinimumGuaranteeActiveChange}
                disabled={disabled}
              />
            </div>
          </div>
        </CardHeader>
        {minimumGuaranteeActive && (
          <CardContent>
            <MinimumGuaranteeEditor
              value={minimumGuarantee}
              onChange={disabled ? undefined : onMinimumGuaranteeChange}
              readOnly={disabled}
            />
          </CardContent>
        )}
      </Card>
    </div>
  );
}
