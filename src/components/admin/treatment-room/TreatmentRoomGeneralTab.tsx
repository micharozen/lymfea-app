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
  { value: "Massage", label: "Massage" },
  { value: "Facial", label: "Soin visage" },
  { value: "Hammam", label: "Hammam" },
  { value: "Jacuzzi", label: "Jacuzzi" },
  { value: "Sauna", label: "Sauna" },
  { value: "Body Wrap", label: "Enveloppement" },
  { value: "Multi-purpose", label: "Polyvalente" },
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
  const { t } = useTranslation("common");

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
              {isUploading ? "Téléchargement..." : "Télécharger"}
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
            <FormLabel>Nom de la salle *</FormLabel>
            <FormControl>
              <Input
                placeholder="Salle Zen"
                {...field}
                disabled={disabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Capabilities (multi-select) */}
      <div className="space-y-2">
        <FormLabel>Soins compatibles *</FormLabel>
        <p className="text-xs text-muted-foreground">
          Sélectionnez les types de soins réalisables dans cette salle
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
                {cap.label}
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
            <FormLabel>Lieu</FormLabel>
            <Select
              onValueChange={field.onChange}
              value={field.value}
              disabled={disabled}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un lieu" />
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
            <FormLabel>Statut</FormLabel>
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
                    {t("status.active")}
                  </div>
                </SelectItem>
                <SelectItem value="inactive">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-red-500" />
                    Inactif
                  </div>
                </SelectItem>
                <SelectItem value="maintenance">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-yellow-500" />
                    Maintenance
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
