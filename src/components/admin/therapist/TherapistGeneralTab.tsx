import { useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PhoneNumberField, CountryOption } from "@/components/PhoneNumberField";
import { User, Loader2, Wallet, Plus, X } from "lucide-react";
import type { TherapistFormValues } from "@/pages/admin/TherapistDetail";
import { BillingProfileForm } from "@/components/admin/billing/BillingProfileForm";

const countries: CountryOption[] = [
  { code: "+33", label: "France", flag: "🇫🇷" },
  { code: "+971", label: "EAU", flag: "🇦🇪" },
  { code: "+1", label: "États-Unis", flag: "🇺🇸" },
  { code: "+44", label: "Royaume-Uni", flag: "🇬🇧" },
  { code: "+49", label: "Allemagne", flag: "🇩🇪" },
  { code: "+39", label: "Italie", flag: "🇮🇹" },
  { code: "+34", label: "Espagne", flag: "🇪🇸" },
  { code: "+41", label: "Suisse", flag: "🇨🇭" },
  { code: "+32", label: "Belgique", flag: "🇧🇪" },
  { code: "+377", label: "Monaco", flag: "🇲🇨" },
];

// Rate brackets by treatment duration. The base brackets (1h/1h15/1h30) are
// always shown and required; the extra ones are added on demand and optional.
type RateName =
  | "rate_45"
  | "rate_60"
  | "rate_75"
  | "rate_90"
  | "rate_105"
  | "rate_120"
  | "rate_150";

interface RateBracket {
  name: RateName;
  minutes: number;
  labelKey: string;
  fallback: string;
  base: boolean;
}

const RATE_BRACKETS: RateBracket[] = [
  { name: "rate_45", minutes: 45, labelKey: "admin:therapists.rate45Label", fallback: "0h45", base: false },
  { name: "rate_60", minutes: 60, labelKey: "admin:therapists.rate60Label", fallback: "1h00", base: true },
  { name: "rate_75", minutes: 75, labelKey: "admin:therapists.rate75Label", fallback: "1h15", base: true },
  { name: "rate_90", minutes: 90, labelKey: "admin:therapists.rate90Label", fallback: "1h30", base: true },
  { name: "rate_105", minutes: 105, labelKey: "admin:therapists.rate105Label", fallback: "1h45", base: false },
  { name: "rate_120", minutes: 120, labelKey: "admin:therapists.rate120Label", fallback: "2h00", base: false },
  { name: "rate_150", minutes: 150, labelKey: "admin:therapists.rate150Label", fallback: "2h30", base: false },
];

interface TherapistGeneralTabProps {
  form: UseFormReturn<TherapistFormValues>;
  disabled: boolean;
  profileImage: string;
  uploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  triggerFileSelect: () => void;
  therapistId: string | null;
}

export function TherapistGeneralTab({
  form,
  disabled,
  profileImage,
  uploading,
  fileInputRef,
  handleImageUpload,
  triggerFileSelect,
  therapistId,
}: TherapistGeneralTabProps) {
  const { t } = useTranslation("common");

  // Extra (non-base) brackets the user has explicitly added this session. A row
  // is shown when it's a base bracket, when it already holds a value (existing
  // therapist), or when it was just added here.
  const [addedRates, setAddedRates] = useState<RateName[]>([]);
  const extraBrackets = RATE_BRACKETS.filter((b) => !b.base);

  const isRateShown = (b: RateBracket): boolean => {
    if (b.base) return true;
    if (addedRates.includes(b.name)) return true;
    const v = form.watch(b.name);
    return v !== undefined && v !== "";
  };

  const shownBrackets = RATE_BRACKETS.filter(isRateShown);
  const availableToAdd = extraBrackets.filter((b) => !isRateShown(b));

  const handleAddRate = (name: string) => {
    setAddedRates((prev) => (prev.includes(name as RateName) ? prev : [...prev, name as RateName]));
  };

  const handleRemoveRate = (name: RateName) => {
    form.setValue(name, "", { shouldDirty: true });
    setAddedRates((prev) => prev.filter((n) => n !== name));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-normal flex items-center gap-2">
                <User className="h-4 w-4 text-gold-600" />
                {t("admin:therapists.identity", "Identité")}
              </CardTitle>
              <CardDescription>
                {t("admin:therapists.identityDesc", "Photo, nom et contact")}
              </CardDescription>
            </div>
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem className="space-y-0">
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={disabled}
                  >
                    <SelectTrigger className="h-7 text-xs gap-1 px-2 w-auto min-w-[90px]">
                      <SelectValue placeholder="En attente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Actif">
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          {t("status.active")}
                        </div>
                      </SelectItem>
                      <SelectItem value="En attente">
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                          {t("status.pending")}
                        </div>
                      </SelectItem>
                      <SelectItem value="Inactif">
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
                          {t("status.inactive")}
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[auto_1fr] gap-6">
            {/* Profile photo */}
            <div className="space-y-1.5 text-center">
              <div
                className={`relative h-20 w-20 rounded-full border-2 border-dashed border-muted-foreground/25 bg-muted/30 overflow-hidden transition-colors ${!disabled ? "cursor-pointer hover:border-gold-500/50" : ""}`}
                onClick={!disabled ? triggerFileSelect : undefined}
              >
                {profileImage ? (
                  <img
                    src={profileImage}
                    className="h-full w-full object-cover"
                    alt="Profile"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <User className="h-6 w-6 text-muted-foreground/50" />
                  </div>
                )}
                {uploading && (
                  <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-[11px] h-6 px-2"
                  onClick={triggerFileSelect}
                  disabled={uploading}
                >
                  {uploading ? "..." : "Modifier"}
                </Button>
              )}
            </div>

            {/* Form fields */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin:therapists.firstName", "Prénom")} *</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={disabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin:therapists.lastName", "Nom")} *</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={disabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" disabled={disabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin:therapists.phone", "Téléphone")} *</FormLabel>
                      <FormControl>
                        <PhoneNumberField
                          value={field.value}
                          onChange={field.onChange}
                          countryCode={form.watch("country_code")}
                          setCountryCode={(val) =>
                            form.setValue("country_code", val)
                          }
                          countries={countries}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Gender */}
              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("admin:therapists.gender", "Genre")}</FormLabel>
                    <Select
                      value={field.value || "none"}
                      onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                      disabled={disabled}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("admin:therapists.genderPlaceholder", "Non renseigné")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">
                          {t("admin:therapists.genderPlaceholder", "Non renseigné")}
                        </SelectItem>
                        <SelectItem value="female">
                          {t("admin:therapists.genderFemale", "Femme")}
                        </SelectItem>
                        <SelectItem value="male">
                          {t("admin:therapists.genderMale", "Homme")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Finance */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-normal flex items-center gap-2">
            <Wallet className="h-4 w-4 text-emerald-500" />
            {t("admin:therapists.finance", "Finance")}
          </CardTitle>
          <CardDescription>
            {t("admin:therapists.financeDesc", "Taux par durée de soin, utilisé quand le lieu n'applique pas de commission globale")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {shownBrackets.map(({ name, labelKey, fallback, base }) => (
            <FormField
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormLabel className="w-20 text-sm text-muted-foreground shrink-0 mt-2">
                    {t(labelKey, fallback)}
                  </FormLabel>
                  <FormControl>
                    <div className="relative w-32">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="--"
                        {...field}
                        value={field.value ?? ""}
                        disabled={disabled}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        &euro;
                      </span>
                    </div>
                  </FormControl>
                  {!base && !disabled && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={t("admin:therapists.removeRate", "Retirer ce taux")}
                      onClick={() => handleRemoveRate(name)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}

          {!disabled && availableToAdd.length > 0 && (
            <div className="w-48 pt-1">
              <SelectField
                value={undefined}
                onChange={handleAddRate}
                searchable={false}
                placeholder={t("admin:therapists.addRate", "Ajouter un taux")}
                aria-label={t("admin:therapists.addRate", "Ajouter un taux")}
                className="h-8 text-xs"
                options={availableToAdd.map((b) => ({
                  value: b.name,
                  label: t(b.labelKey, b.fallback),
                }))}
              />
            </div>
          )}

          <p className="text-xs text-muted-foreground pt-1">
            {t("admin:therapists.rateHint", "Montant fixe versé au thérapeute par soin. Pour les durées hors palier, calcul proportionnel entre les paliers configurés.")}
          </p>
        </CardContent>
      </Card>

      {/* Billing information — stored in billing_profiles table, persisted independently */}
      {therapistId && (
        <BillingProfileForm
          ownerType="therapist"
          ownerId={therapistId}
          disabled={disabled}
        />
      )}
    </div>
  );
}
