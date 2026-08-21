import { UseFormReturn, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, Loader2, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TreatmentRoomFormValues } from "@/pages/admin/TreatmentRoomDetail";

export const ROOM_CAPABILITIES = [
  { value: "Massage", key: "massage", label: "Massage" },
  { value: "Facial", key: "facial", label: "Soin visage" },
  { value: "Hammam", key: "hammam", label: "Hammam" },
  { value: "Jacuzzi", key: "jacuzzi", label: "Jacuzzi" },
  { value: "Sauna", key: "sauna", label: "Sauna" },
  { value: "Body Wrap", key: "bodyWrap", label: "Enveloppement" },
  { value: "Multi-purpose", key: "multiPurpose", label: "Polyvalente" },
] as const;

interface TreatmentRoomGeneralTabProps {
  form: UseFormReturn<TreatmentRoomFormValues>;
  disabled: boolean;
  roomImage: string;
  isUploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  triggerFileSelect: () => void;
}

export function TreatmentRoomGeneralTab({
  form,
  disabled,
  roomImage,
  isUploading,
  fileInputRef,
  handleImageUpload,
  triggerFileSelect,
}: TreatmentRoomGeneralTabProps) {
  const { t } = useTranslation(["admin", "common"]);

  const capabilities = useWatch({ control: form.control, name: "capabilities" });

  const { data: hotels } = useQuery({
    queryKey: ["hotels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotels")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const toggleCapability = (value: string) => {
    const current = capabilities || [];
    const updated = current.includes(value)
      ? current.filter((c) => c !== value)
      : [...current, value];
    form.setValue("capabilities", updated, { shouldValidate: true });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Image */}
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-muted">
          {roomImage ? (
            <img
              src={roomImage}
              alt="Room preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <Upload className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        {!disabled && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploading}
              onClick={triggerFileSelect}
            >
              {isUploading ? t("treatmentRoomGeneral.uploading") : t("treatmentRoomGeneral.upload")}
              {isUploading && (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Name */}
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("treatmentRoomGeneral.nameLabel")}</FormLabel>
            <FormControl>
              <Input
                placeholder={t("treatmentRoomGeneral.namePlaceholder")}
                {...field}
                disabled={disabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Concurrent beds (occupations simultanées) */}
      <FormField
        control={form.control}
        name="capacity"
        render={({ field }) => (
          <FormItem className="max-w-[200px]">
            <FormLabel>{t("treatmentRoomGeneral.bedsLabel")}</FormLabel>
            <p className="text-xs text-muted-foreground">
              {t("treatmentRoomGeneral.bedsHelp")}
            </p>
            <FormControl>
              <Input
                type="number"
                min={1}
                step={1}
                disabled={disabled}
                value={field.value}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  field.onChange(Number.isNaN(parsed) ? 1 : Math.max(1, parsed));
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Capabilities (multi-select) */}
      <div className="space-y-2">
        <FormLabel>{t("treatmentRoomGeneral.capabilitiesLabel")}</FormLabel>
        <p className="text-xs text-muted-foreground">
          {t("treatmentRoomGeneral.capabilitiesHelp")}
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          {ROOM_CAPABILITIES.map((cap) => {
            const isSelected = capabilities?.includes(cap.value) || false;
            return (
              <button
                key={cap.value}
                type="button"
                disabled={disabled}
                onClick={() => toggleCapability(cap.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm border transition-colors",
                  isSelected
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background text-foreground border-border hover:bg-muted",
                  disabled && "opacity-60 cursor-not-allowed"
                )}
              >
                {isSelected && <Check className="h-3 w-3" />}
                {t(`treatmentRoomGeneral.capabilities.${cap.key}`)}
              </button>
            );
          })}
        </div>
        {form.formState.errors.capabilities?.message && (
          <p className="text-sm text-destructive">
            {form.formState.errors.capabilities.message}
          </p>
        )}
      </div>

      {/* Hotel */}
      <FormField
        control={form.control}
        name="hotel_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("treatmentRoomGeneral.venueLabel")}</FormLabel>
            <Select
              onValueChange={field.onChange}
              value={field.value}
              disabled={disabled}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={t("treatmentRoomGeneral.venuePlaceholder")} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {hotels?.map((hotel) => (
                  <SelectItem key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Status */}
      <FormField
        control={form.control}
        name="status"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("treatmentRoomGeneral.statusLabel")}</FormLabel>
            <Select
              onValueChange={field.onChange}
              value={field.value}
              disabled={disabled}
            >
              <FormControl>
                <SelectTrigger className="max-w-[200px]">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="active">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    {t("common:status.active")}
                  </div>
                </SelectItem>
                <SelectItem value="inactive">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-red-500" />
                    {t("common:status.inactive")}
                  </div>
                </SelectItem>
                <SelectItem value="maintenance">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-yellow-500" />
                    {t("treatmentRoomGeneral.maintenance")}
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
