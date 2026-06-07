import { useTranslation } from "react-i18next";
import { Controller, type UseFormReturn } from "react-hook-form";
import { Building2, Sparkles } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { OnboardingValues } from "../schemas";
import { AddressAutocomplete, type ParsedAddress } from "../AddressAutocomplete";

interface VenueStepProps {
  form: UseFormReturn<OnboardingValues>;
}

export function VenueStep({ form }: VenueStepProps) {
  const { t } = useTranslation("admin");
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const venueType = watch("venueType");

  function applyParsed(parsed: ParsedAddress, opts: { setName?: boolean } = {}) {
    if (opts.setName && parsed.name) {
      setValue("venueName", parsed.name, { shouldValidate: true, shouldDirty: true });
    }
    if (parsed.streetLine || parsed.formatted) {
      setValue("venueAddress", parsed.streetLine || parsed.formatted, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
    if (parsed.postalCode) {
      setValue("venuePostalCode", parsed.postalCode, { shouldDirty: true });
    }
    if (parsed.city) {
      setValue("venueCity", parsed.city, { shouldDirty: true });
    }
    if (parsed.country) {
      setValue("venueCountry", parsed.country, { shouldDirty: true });
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>{t("onboarding.venue.type.label")}</Label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setValue("venueType", "hotel", { shouldValidate: true })}
            className={cn(
              "flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition",
              venueType === "hotel"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50",
            )}
          >
            <Building2 className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-medium">
                {t("onboarding.venue.type.hotel")}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {t("onboarding.venue.type.hotelHint")}
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setValue("venueType", "spa", { shouldValidate: true })}
            className={cn(
              "flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition",
              venueType === "spa"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50",
            )}
          >
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-medium">
                {t("onboarding.venue.type.spa")}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {t("onboarding.venue.type.spaHint")}
              </div>
            </div>
          </button>
        </div>
        {errors.venueType && (
          <p className="text-xs text-destructive">
            {t("onboarding.venue.type.error")}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="venueName">{t("onboarding.venue.name.label")}</Label>
        <Controller
          control={form.control}
          name="venueName"
          render={({ field }) => (
            <AddressAutocomplete
              id="venueName"
              placeholder={t("onboarding.venue.name.placeholder")}
              value={field.value ?? ""}
              onChange={(v) => field.onChange(v)}
              includedPrimaryTypes={["establishment"]}
              onPlaceSelected={(parsed) => applyParsed(parsed, { setName: true })}
            />
          )}
        />
        <p className="text-[11px] text-muted-foreground">
          {t("onboarding.venue.name.hint")}
        </p>
        {errors.venueName && (
          <p className="text-xs text-destructive">
            {t("onboarding.venue.name.error")}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="venueAddress">{t("onboarding.venue.address.label")}</Label>
        <Controller
          control={form.control}
          name="venueAddress"
          render={({ field }) => (
            <AddressAutocomplete
              id="venueAddress"
              placeholder={t("onboarding.venue.address.placeholder")}
              value={field.value ?? ""}
              onChange={(v) => field.onChange(v)}
              includedPrimaryTypes={["street_address", "premise", "subpremise"]}
              onPlaceSelected={(parsed) => applyParsed(parsed)}
            />
          )}
        />
        {errors.venueAddress && (
          <p className="text-xs text-destructive">
            {t("onboarding.venue.address.error")}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="venuePostalCode">{t("onboarding.venue.postalCode.label")}</Label>
          <Input
            id="venuePostalCode"
            autoComplete="postal-code"
            placeholder={t("onboarding.venue.postalCode.placeholder")}
            {...register("venuePostalCode")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="venueCity">{t("onboarding.venue.city.label")}</Label>
          <Input
            id="venueCity"
            autoComplete="address-level2"
            placeholder={t("onboarding.venue.city.placeholder")}
            {...register("venueCity")}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="venueCountry">{t("onboarding.venue.country.label")}</Label>
        <Input
          id="venueCountry"
          autoComplete="country-name"
          placeholder={t("onboarding.venue.country.placeholder")}
          {...register("venueCountry")}
        />
      </div>
    </div>
  );
}
