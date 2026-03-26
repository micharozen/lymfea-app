import { UseFormReturn, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTreatmentCategories } from "@/hooks/useTreatmentCategories";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, Loader2 } from "lucide-react";
import { SPECIALTY_OPTIONS } from "@/lib/specialtyTypes";
import type { TreatmentFormValues } from "@/pages/admin/TreatmentDetail";

interface TreatmentGeneralTabProps {
  form: UseFormReturn<TreatmentFormValues>;
  disabled: boolean;
  menuImage: string;
  isUploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  triggerFileSelect: () => void;
}

export function TreatmentGeneralTab({
  form,
  disabled,
  menuImage,
  isUploading,
  fileInputRef,
  handleImageUpload,
  triggerFileSelect,
}: TreatmentGeneralTabProps) {
  const { t, i18n } = useTranslation("common");

  const selectedHotelId = useWatch({ control: form.control, name: "hotel_id" });

  const { data: hotels } = useQuery({
    queryKey: ["hotels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotels")
        .select("id, name, currency")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { categories, isLoading: categoriesLoading } =
    useTreatmentCategories(selectedHotelId);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Image */}
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-32 h-32 rounded-lg border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-muted">
          {menuImage ? (
            <img
              src={menuImage}
              alt="Menu preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <Upload className="h-8 w-8 text-muted-foreground" />
          )}
        </div>
        {!disabled && (
          <div className="flex items-center gap-3">
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

      {/* Hotel */}
      <FormField
        control={form.control}
        name="hotel_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Hôtel *</FormLabel>
            <Select
              onValueChange={(value) => {
                field.onChange(value);
                form.setValue("category", "");
              }}
              value={field.value}
              disabled={disabled}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un hôtel" />
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

      {/* Name, Category, Specialty */}
      <div className="grid grid-cols-3 gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nom du menu *</FormLabel>
              <FormControl>
                <Input
                  placeholder="Nom du menu"
                  {...field}
                  disabled={disabled}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Catégorie *</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={disabled}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner une catégorie" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {categoriesLoading ? (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : categories.length === 0 ? (
                    <div className="px-2 py-2 text-sm text-muted-foreground">
                      {selectedHotelId
                        ? "Aucune catégorie. Ajoutez-en dans les paramètres du lieu."
                        : "Sélectionnez d'abord un lieu"}
                    </div>
                  ) : (
                    categories.map((category) => (
                      <SelectItem key={category.id} value={category.name}>
                        {category.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="specialty"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("admin:treatments.specialty")}</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value || ""}
                disabled={disabled}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t("admin:treatments.noSpecialty")}
                    />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {SPECIALTY_OPTIONS.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {i18n.language === "fr" ? s.labelFr : s.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Description */}
      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Description du menu"
                className="min-h-[100px]"
                {...field}
                disabled={disabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Lead time */}
      <FormField
        control={form.control}
        name="lead_time"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-sm whitespace-nowrap">
              Délai minimum de réservation (min)
            </FormLabel>
            <FormControl>
              <Input
                type="number"
                placeholder="0"
                className="max-w-[200px]"
                {...field}
                disabled={disabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Bestseller */}
      <FormField
        control={form.control}
        name="is_bestseller"
        render={({ field }) => (
          <FormItem>
            <div className="flex items-center gap-2">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  className="h-4 w-4"
                  disabled={disabled}
                />
              </FormControl>
              <FormLabel className="text-sm cursor-pointer font-normal m-0">
                Bestseller (mis en avant sur la page de réservation)
              </FormLabel>
            </div>
          </FormItem>
        )}
      />

      {/* Service for */}
      <FormField
        control={form.control}
        name="service_for"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Service pour *</FormLabel>
            <Select
              onValueChange={field.onChange}
              value={field.value}
              disabled={disabled}
            >
              <FormControl>
                <SelectTrigger className="max-w-[200px]">
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="Male">Male</SelectItem>
                <SelectItem value="Female">Female</SelectItem>
                <SelectItem value="All">All</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Status & Sort order */}
      <div className="grid grid-cols-3 gap-4">
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
                  <SelectTrigger>
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
                      {t("status.inactive")}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="sort_order"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm whitespace-nowrap">
                Ordre d'affichage
              </FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="10"
                  {...field}
                  disabled={disabled}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
