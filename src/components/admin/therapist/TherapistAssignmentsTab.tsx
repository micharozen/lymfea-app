import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MinimumGuaranteeEditor } from "@/components/admin/MinimumGuaranteeEditor";
import { Building2, Check, Coins, Sparkles, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { TherapistTreatmentsSelector } from "@/components/admin/therapist/TherapistTreatmentsSelector";
import { TherapistTreatmentRatesEditor } from "@/components/admin/therapist/TherapistTreatmentRatesEditor";
import type { TreatmentRateMap } from "@/lib/therapistEarnings";

interface TherapistAssignmentsTabProps {
  disabled: boolean;
  /** Absent à la création : le groupe de priorité n'existe qu'une fois le lien au lieu créé. */
  therapistId?: string;
  selectedHotels: string[];
  onHotelsChange: (hotels: string[]) => void;
  selectedTreatmentIds: string[];
  onTreatmentsChange: (ids: string[]) => void;
  treatmentRates: TreatmentRateMap;
  onTreatmentRatesChange: (value: TreatmentRateMap) => void;
  treatmentRatesActive: boolean;
  onTreatmentRatesActiveChange: (value: boolean) => void;
  /** Barème par défaut du thérapeute, point de départ de chaque barème de soin. */
  defaultRateScale: Record<string, number>;
  minimumGuarantee: Record<string, number>;
  onMinimumGuaranteeChange: (value: Record<string, number>) => void;
  minimumGuaranteeActive: boolean;
  onMinimumGuaranteeActiveChange: (value: boolean) => void;
}

interface Hotel {
  id: string;
  name: string;
  image: string | null;
  city: string | null;
}

function VenueLogo({ hotel }: { hotel: Hotel }) {
  return hotel.image ? (
    <img
      src={hotel.image}
      alt={hotel.name}
      className="h-8 w-8 shrink-0 rounded-md object-cover"
    />
  ) : (
    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted text-[10px] font-medium text-muted-foreground">
      {hotel.name.substring(0, 2).toUpperCase()}
    </div>
  );
}

export function TherapistAssignmentsTab({
  disabled,
  therapistId,
  selectedHotels,
  onHotelsChange,
  selectedTreatmentIds,
  onTreatmentsChange,
  treatmentRates,
  onTreatmentRatesChange,
  treatmentRatesActive,
  onTreatmentRatesActiveChange,
  defaultRateScale,
  minimumGuarantee,
  onMinimumGuaranteeChange,
  minimumGuaranteeActive,
  onMinimumGuaranteeActiveChange,
}: TherapistAssignmentsTabProps) {
  const { t } = useTranslation("common");
  const [hotels, setHotels] = useState<Hotel[]>([]);

  // Groupe de priorité du praticien sur chaque lieu, en lecture seule : il se règle
  // côté lieu (onglet Thérapeutes), puisqu'il appartient au couple lieu↔praticien et
  // peut différer d'un lieu à l'autre. On ne l'affiche que sur les lieux qui ont
  // réellement plusieurs groupes — ailleurs le rang 1 par défaut ne veut rien dire.
  const { data: venueGroups } = useQuery({
    queryKey: ["therapist-venue-groups", therapistId],
    enabled: !!therapistId,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from("therapist_venues")
        .select("hotel_id, therapist_id, priority");
      if (error) throw error;

      const ranksByHotel = new Map<string, Set<number>>();
      for (const row of data ?? []) {
        const ranks = ranksByHotel.get(row.hotel_id) ?? new Set<number>();
        ranks.add(row.priority ?? 1);
        ranksByHotel.set(row.hotel_id, ranks);
      }

      return Object.fromEntries(
        (data ?? [])
          .filter((row) => row.therapist_id === therapistId)
          .filter((row) => (ranksByHotel.get(row.hotel_id)?.size ?? 1) > 1)
          .map((row) => [row.hotel_id, row.priority ?? 1]),
      );
    },
  });

  useEffect(() => {
    fetchHotels();
  }, []);

  const fetchHotels = async () => {
    const { data } = await supabase
      .from("hotels")
      .select("id, name, image, city")
      .order("name");
    setHotels(data || []);
  };

  const toggleHotel = (id: string) => {
    onHotelsChange(
      selectedHotels.includes(id)
        ? selectedHotels.filter((h) => h !== id)
        : [...selectedHotels, id]
    );
  };

  const visibleHotels = disabled
    ? hotels.filter((h) => selectedHotels.includes(h.id))
    : hotels;

  return (
    <div className="space-y-6">
      {/* Venues */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-normal flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            {t("admin:therapists.venues", "Lieux")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {visibleHotels.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("admin:therapists.noVenues", "Aucun lieu assigné")}
            </p>
          ) : (
            <div className="grid gap-2 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {visibleHotels.map((hotel) => {
                const isSelected = selectedHotels.includes(hotel.id);
                return (
                  <button
                    key={hotel.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleHotel(hotel.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors",
                      !disabled && "hover:bg-muted/50",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border",
                      disabled && "cursor-default"
                    )}
                  >
                    <VenueLogo hotel={hotel} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{hotel.name}</p>
                      {hotel.city && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {hotel.city}
                        </p>
                      )}
                      {venueGroups?.[hotel.id] && (
                        <Badge
                          variant="secondary"
                          className="mt-1 text-[10px] px-1.5 py-0 font-normal"
                          title={t(
                            "admin:venueTherapists.groupOnVenueHint",
                            "Se règle depuis la fiche du lieu, onglet Thérapeutes.",
                          )}
                        >
                          {t("admin:venueTherapists.groupOption", {
                            group: venueGroups[hotel.id],
                            defaultValue: "Groupe {{group}}",
                          })}
                        </Badge>
                      )}
                    </div>
                    {isSelected && !disabled && (
                      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prestations réalisables */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-normal flex items-center gap-2">
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

      {/* Barèmes spécifiques par soin */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-normal flex items-center gap-2">
                <Coins className="h-4 w-4 text-muted-foreground" />
                {t("admin:therapists.treatmentRates.title", {
                  defaultValue: "Taux spécifiques par soin",
                })}
              </CardTitle>
              <CardDescription>
                {t("admin:therapists.treatmentRates.description", {
                  defaultValue:
                    "Cas rare : une prestation qui ne rapporte pas la même chose que les autres. Sans barème spécifique, tous les soins utilisent le barème par durée de l'onglet Général.",
                })}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="tr-active" className="text-xs text-muted-foreground">
                {treatmentRatesActive
                  ? t("admin:therapists.active", "Actif")
                  : t("admin:therapists.inactive", "Inactif")}
              </Label>
              <Switch
                id="tr-active"
                checked={treatmentRatesActive}
                onCheckedChange={onTreatmentRatesActiveChange}
                disabled={disabled}
              />
            </div>
          </div>
        </CardHeader>
        {treatmentRatesActive && (
          <CardContent>
            <TherapistTreatmentRatesEditor
              value={treatmentRates}
              onChange={onTreatmentRatesChange}
              selectedTreatmentIds={selectedTreatmentIds}
              venueIds={selectedHotels}
              venueNames={Object.fromEntries(hotels.map((h) => [h.id, h.name]))}
              defaultScale={defaultRateScale}
              disabled={disabled}
            />
          </CardContent>
        )}
      </Card>

      {/* Minimum Guarantee */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-normal flex items-center gap-2">
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
