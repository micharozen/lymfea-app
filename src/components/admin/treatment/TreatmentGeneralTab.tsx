import { UseFormReturn, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgScope } from "@/hooks/useOrgScope";
import { hotelKeys, listHotelsForOrgDropdown } from "@shared/db";
import { slugify } from "@/lib/slugify";
import { CategorySelectField } from "@/components/admin/category/CategorySelectField";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AvailableDaysPicker } from "@/components/admin/treatment/AvailableDaysPicker";
import { Upload, Loader2 } from "lucide-react";
import { SPECIALTY_OPTIONS } from "@/lib/specialtyTypes";
import { useVenueAmenities } from "@/hooks/useVenueAmenities";
import { getAmenityLabel } from "@/lib/amenityTypes";
import type { TreatmentFormValues } from "@/pages/admin/TreatmentDetail";

const NO_AMENITY = "__none__";

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
  const { t, i18n } = useTranslation(['admin', 'common']);

  const selectedHotelId = useWatch({ control: form.control, name: "hotel_id" });
  const { enabledAmenities } = useVenueAmenities(selectedHotelId || "");
  const isAmenityTreatment = useWatch({ control: form.control, name: "is_amenity" });

  // Auto-prepopulate slug from the English name when present, else the French one,
  // until the user manually edits the slug field.
  const nameValue = useWatch({ control: form.control, name: "name" });
  const nameEnValue = useWatch({ control: form.control, name: "name_en" });
  const slugSource = nameEnValue?.trim() || nameValue;
  const slugTouchedRef = useRef(false);
  const autoSlugRef = useRef("");
  useEffect(() => {
    if (slugTouchedRef.current) return;
    const current = form.getValues("slug");
    // In edit mode the slug comes from the DB — don't overwrite it. A slug we
    // generated ourselves on a previous keystroke stays free to be refreshed.
    if (current && current !== autoSlugRef.current) {
      slugTouchedRef.current = true;
      return;
    }
    const next = slugify(slugSource);
    autoSlugRef.current = next;
    form.setValue("slug", next, { shouldValidate: false });
  }, [slugSource, form]);

  const scope = useOrgScope();
  const { data: hotels } = useQuery({
    queryKey: hotelKeys.list(scope),
    enabled: !!scope,
    queryFn: () => listHotelsForOrgDropdown(supabase, scope!),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5 max-w-5xl">
      {/* ── Colonne gauche : identité du soin ───────────────────────────── */}
      <div className="space-y-5">
        {/* Image + Nom FR */}
        <div className="flex items-end gap-4">
          <button
            type="button"
            onClick={!disabled ? triggerFileSelect : undefined}
            disabled={disabled || isUploading}
            className="relative w-16 h-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-muted shrink-0 hover:border-primary/50 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            {menuImage ? (
              <img
                src={menuImage}
                alt={t('treatmentTab.photo')}
                className="w-full h-full object-cover"
              />
            ) : (
              <Upload className="h-4 w-4 text-muted-foreground" />
            )}
            {isUploading && (
              <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>{t('treatmentTab.name')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('treatmentTab.namePlaceholder')}
                    {...field}
                    disabled={disabled}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="name_en"
          render={({ field }) => (
            <FormItem>
              <FormLabel>🇬🇧 Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="English name"
                  {...field}
                  disabled={disabled}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Public URL identifier (slug) */}
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('treatmentTab.publicLink')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('treatmentTab.publicLinkPlaceholder')}
                  {...field}
                  disabled={disabled}
                  onChange={(e) => {
                    slugTouchedRef.current = true;
                    field.onChange(e.target.value);
                  }}
                />
              </FormControl>
              <FormDescription className="text-[11px] leading-snug">
                Identifiant utilisé dans l'URL publique du soin
                (ex. <code className="text-[10px]">/client/ritz-paris/treatment/{slugify(field.value || slugSource) || "massage-suedois-60"}</code>).
                Lettres minuscules, chiffres et tirets uniquement.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={t('treatmentTab.descriptionPlaceholder')}
                  className="min-h-[80px]"
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
          name="description_en"
          render={({ field }) => (
            <FormItem>
              <FormLabel>🇬🇧 Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="English description"
                  className="min-h-[80px]"
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
                  {t('treatmentTab.bestseller')}
                </FormLabel>
              </div>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="bookable_online"
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
                  {t('treatmentTab.bookableOnline')}
                </FormLabel>
              </div>
              <FormDescription className="text-[11px] leading-snug">
                {t('treatmentTab.bookableOnlineHint')}
              </FormDescription>
            </FormItem>
          )}
        />
      </div>

      {/* ── Colonne droite : paramétrage ────────────────────────────────── */}
      <div className="space-y-5">
        <FormField
          control={form.control}
          name="hotel_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('treatmentTab.venue')}</FormLabel>
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
                    <SelectValue placeholder={t('treatmentTab.selectVenue')} />
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

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('treatmentTab.status')}</FormLabel>
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
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('treatmentTab.category')}</FormLabel>
              <FormControl>
                <CategorySelectField
                  hotelId={selectedHotelId}
                  value={field.value}
                  onChange={field.onChange}
                  disabled={disabled}
                />
              </FormControl>
              <FormDescription>{t("admin:treatments.categoryHelp")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Amenity toggle: turns this treatment into an equipment access (pool, sauna…). */}
        <FormField
          control={form.control}
          name="is_amenity"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-md border p-3">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    const next = checked === true;
                    field.onChange(next);
                    if (next) {
                      // Amenity access has no therapist/gender: clear specialty and
                      // default service_for so the hidden fields don't block saving.
                      form.setValue("specialty", "");
                      form.setValue("service_for", "All");
                      // Un seul équipement au lieu : rien à choisir.
                      if (enabledAmenities.length === 1 && !form.getValues("amenity_id")) {
                        form.setValue("amenity_id", enabledAmenities[0].id);
                      }
                    } else {
                      form.setValue("amenity_id", null);
                    }
                  }}
                  disabled={disabled || !selectedHotelId}
                />
              </FormControl>
              <div className="space-y-1">
                <FormLabel className="font-normal">
                  {t('treatmentTab.linkedAmenity')}
                </FormLabel>
                <FormDescription className="text-[11px] leading-snug">
                  Sa disponibilité suit la capacité de la commodité (pas les
                  salles/thérapeutes) et sa réservation crée une réservation de
                  commodité liée.
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        {isAmenityTreatment ? (
          <FormField
            control={form.control}
            name="amenity_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('treatmentTab.amenity')}</FormLabel>
                <Select
                  onValueChange={(value) =>
                    field.onChange(value === NO_AMENITY ? null : value)
                  }
                  value={field.value ?? NO_AMENITY}
                  disabled={disabled || !selectedHotelId}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t('treatmentTab.selectAmenity')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {enabledAmenities.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name || getAmenityLabel(a.type, i18n.language)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  {t('treatmentTab.amenityCapacityNote')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <>
            <FormField
              control={form.control}
              name="specialty"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("admin:treatments.specialty")} *</FormLabel>
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
                  <FormDescription>{t("admin:treatments.specialtyHelp")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="service_for"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('treatmentTab.serviceFor')}</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={disabled}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('treatmentTab.select')} />
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
          </>
        )}

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="lead_time"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('treatmentTab.minNotice')}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0"
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
            name="sort_order"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('treatmentTab.displayOrder')}</FormLabel>
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

        <FormField
          control={form.control}
          name="available_days"
          render={({ field }) => {
            const selected: number[] = field.value ?? [];
            return (
              <FormItem>
                <FormLabel>{t('treatmentTab.availableDays')}</FormLabel>
                <FormControl>
                  <AvailableDaysPicker
                    value={selected}
                    onChange={field.onChange}
                    disabled={disabled}
                  />
                </FormControl>
                <FormDescription className="text-[11px] leading-snug">
                  {selected.length === 0
                    ? t('treatmentTab.availableDaysAllHint')
                    : t('treatmentTab.availableDaysSelectedHint')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            );
          }}
        />
      </div>
    </div>
  );
}
