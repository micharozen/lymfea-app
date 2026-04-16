import { UseFormReturn, useWatch } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/formatPrice";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus } from "lucide-react";
import type { TreatmentFormValues } from "@/pages/admin/TreatmentDetail";

interface TreatmentAddonsTabProps {
  form: UseFormReturn<TreatmentFormValues>;
  disabled: boolean;
  currentTreatmentId: string | null;
}

interface AddonCandidate {
  id: string;
  name: string;
  name_en: string | null;
  duration: number | null;
  price: number | null;
  currency: string | null;
  price_on_request: boolean | null;
}

export function TreatmentAddonsTab({
  form,
  disabled,
  currentTreatmentId,
}: TreatmentAddonsTabProps) {
  const isAddon = useWatch({ control: form.control, name: "is_addon" });
  const selectedHotelId = useWatch({
    control: form.control,
    name: "hotel_id",
  });
  const selectedAddonIds = useWatch({
    control: form.control,
    name: "addon_ids",
  });

  const { data: addonCandidates, isLoading } = useQuery({
    queryKey: ["treatment-addon-candidates", selectedHotelId],
    queryFn: async (): Promise<AddonCandidate[]> => {
      if (!selectedHotelId) return [];
      const { data, error } = await supabase
        .from("treatment_menus")
        .select(
          "id, name, name_en, duration, price, currency, price_on_request"
        )
        .eq("hotel_id", selectedHotelId)
        .eq("is_addon", true)
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data ?? []) as AddonCandidate[];
    },
    enabled: !!selectedHotelId && !isAddon,
  });

  const toggleAddon = (addonId: string, checked: boolean) => {
    const current = selectedAddonIds ?? [];
    if (checked) {
      if (!current.includes(addonId)) {
        form.setValue("addon_ids", [...current, addonId], {
          shouldDirty: true,
        });
      }
    } else {
      form.setValue(
        "addon_ids",
        current.filter((id) => id !== addonId),
        { shouldDirty: true }
      );
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="rounded-lg border p-4 space-y-3">
        <FormField
          control={form.control}
          name="is_addon"
          render={({ field }) => (
            <FormItem className="flex items-start justify-between gap-4 space-y-0">
              <div className="space-y-1">
                <FormLabel className="text-sm font-medium">
                  Ce soin est un add-on
                </FormLabel>
                <p className="text-xs text-muted-foreground">
                  Un add-on ne peut pas être réservé seul. Il sera proposé au
                  client après sélection d'un créneau pour un soin principal.
                </p>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={disabled}
                />
              </FormControl>
            </FormItem>
          )}
        />
      </div>

      {!isAddon && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <FormLabel className="text-base font-semibold">
                Add-ons liés à ce soin
              </FormLabel>
              <p className="text-xs text-muted-foreground mt-1">
                Sélectionnez les add-ons qui pourront être proposés après ce
                soin.
              </p>
            </div>
          </div>

          {!selectedHotelId ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Sélectionnez un lieu dans l'onglet Général pour voir les add-ons
              disponibles.
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !addonCandidates || addonCandidates.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground space-y-2">
              <p>Aucun add-on disponible pour ce lieu.</p>
              <p className="text-xs">
                Créez d'abord un soin et marquez-le comme add-on pour pouvoir
                le rattacher ici.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {addonCandidates
                .filter((a) => a.id !== currentTreatmentId)
                .map((addon) => {
                  const checked = (selectedAddonIds ?? []).includes(addon.id);
                  const priceLabel = addon.price_on_request
                    ? "Sur demande"
                    : formatPrice(addon.price ?? 0, addon.currency ?? "EUR");
                  return (
                    <label
                      key={addon.id}
                      className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          toggleAddon(addon.id, v === true)
                        }
                        disabled={disabled}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {addon.name}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          {addon.duration ? (
                            <span>{addon.duration} min</span>
                          ) : null}
                          <span>·</span>
                          <span>{priceLabel}</span>
                        </div>
                      </div>
                      {checked && (
                        <Badge variant="secondary" className="text-[10px]">
                          Lié
                        </Badge>
                      )}
                    </label>
                  );
                })}
            </div>
          )}

          {!disabled &&
            addonCandidates &&
            addonCandidates.length === 0 &&
            selectedHotelId && (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Plus className="h-3 w-3" /> Créez un nouveau soin, puis activez
                "Ce soin est un add-on".
              </p>
            )}
        </div>
      )}
    </div>
  );
}
