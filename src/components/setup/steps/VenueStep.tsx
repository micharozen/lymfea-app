import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { COUNTRY_OPTIONS, TIMEZONE_OPTIONS, getCountryDefaults } from "@/lib/timezones";
import { venueSchema } from "@/lib/venueSetup/schemas";
import { AddressAutocomplete, type ParsedAddress } from "@/components/onboarding/AddressAutocomplete";
import { ChoiceCards, Field, SectionTitle } from "../SetupFields";
import { sectionObject, str, type StepProps } from "../types";

type Values = z.infer<typeof venueSchema>;

/** Google returns the country name in the browser language; match it to our keys. */
function countryKey(parsed: ParsedAddress): string | null {
  const name = parsed.country.toLowerCase();
  const option = COUNTRY_OPTIONS.find((c) => c.label.toLowerCase() === name || c.value === name);
  return option?.value ?? null;
}

const TEXT_KEYS = [
  "name",
  "name_en",
  "landing_subtitle",
  "landing_subtitle_en",
  "description",
  "description_en",
  "website_url",
  "contact_email",
  "address",
  "postal_code",
  "city",
  "access_instructions",
  "access_instructions_en",
] as const;

export function VenueStep({ state, formId, onSave }: StepProps) {
  const { t } = useTranslation("setup");
  const hotel = sectionObject(state, "hotel");

  const form = useForm<Values>({
    resolver: zodResolver(venueSchema),
    defaultValues: {
      hotel: {
        ...Object.fromEntries(TEXT_KEYS.map((k) => [k, str(hotel[k])])),
        name: str(hotel.name) || state.label,
        venue_type: (hotel.venue_type as Values["hotel"]["venue_type"]) ?? undefined,
        country: str(hotel.country) || "france",
        timezone: str(hotel.timezone),
      } as Values["hotel"],
    },
  });
  const { register, control, handleSubmit, formState, setValue } = form;

  const applyPlace = (parsed: ParsedAddress) => {
    const opts = { shouldDirty: true, shouldValidate: true };
    if (parsed.streetLine || parsed.formatted) setValue("hotel.address", parsed.streetLine || parsed.formatted, opts);
    if (parsed.postalCode) setValue("hotel.postal_code", parsed.postalCode, opts);
    if (parsed.city) setValue("hotel.city", parsed.city, opts);
    const country = countryKey(parsed);
    if (country) setValue("hotel.country", country, opts);
  };
  const e = formState.errors.hotel;

  const submit = (v: Values) => {
    // Timezone follows the country unless explicitly chosen.
    const timezone = v.hotel.timezone || getCountryDefaults(v.hotel.country)?.timezone || "Europe/Paris";
    onSave({ hotel: { ...v.hotel, timezone } });
  };

  return (
    <form id={formId} onSubmit={handleSubmit(submit)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("venue.name")} required error={e?.name?.message} htmlFor="name">
          <Input id="name" {...register("hotel.name")} />
        </Field>
        <Field label={t("venue.nameEn")} hint={t("venue.nameEnHint")} htmlFor="name_en">
          <Input id="name_en" {...register("hotel.name_en")} />
        </Field>
      </div>

      <Field label={t("venue.type")} required error={e?.venue_type?.message}>
        <Controller
          control={control}
          name="hotel.venue_type"
          render={({ field }) => (
            <ChoiceCards
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: "hotel", label: t("venue.typeHotel"), hint: t("venue.typeHotelHint") },
                { value: "spa", label: t("venue.typeSpa"), hint: t("venue.typeSpaHint") },
              ]}
            />
          )}
        />
      </Field>

      <SectionTitle title={t("venue.presentation")} description={t("venue.presentationDesc")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("venue.subtitle")} hint={t("venue.subtitleHint")}>
          <Input {...register("hotel.landing_subtitle")} />
        </Field>
        <Field label={t("venue.subtitleEn")}>
          <Input {...register("hotel.landing_subtitle_en")} />
        </Field>
        <Field label={t("venue.description")}>
          <Textarea rows={4} {...register("hotel.description")} />
        </Field>
        <Field label={t("venue.descriptionEn")}>
          <Textarea rows={4} {...register("hotel.description_en")} />
        </Field>
        <Field label={t("venue.website")}>
          <Input type="url" placeholder="https://" {...register("hotel.website_url")} />
        </Field>
        <Field label={t("venue.contactEmail")} hint={t("venue.contactEmailHint")} error={e?.contact_email?.message}>
          <Input type="email" {...register("hotel.contact_email")} />
        </Field>
      </div>

      <SectionTitle title={t("venue.addressTitle")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("fields.address")} required error={e?.address?.message} hint={t("venue.addressHint")} className="sm:col-span-2">
          <Controller
            control={control}
            name="hotel.address"
            render={({ field }) => (
              <AddressAutocomplete
                id="hotel-address"
                value={field.value ?? ""}
                placeholder={t("venue.addressPlaceholder")}
                onChange={field.onChange}
                includedPrimaryTypes={["street_address", "premise", "subpremise", "establishment"]}
                onPlaceSelected={applyPlace}
              />
            )}
          />
        </Field>
        <Field label={t("fields.postalCode")}>
          <Input {...register("hotel.postal_code")} />
        </Field>
        <Field label={t("fields.city")} required error={e?.city?.message}>
          <Input {...register("hotel.city")} />
        </Field>
        <Field label={t("fields.country")} required error={e?.country?.message}>
          <Controller
            control={control}
            name="hotel.country"
            render={({ field }) => (
              <SelectField
                value={field.value}
                onChange={field.onChange}
                options={COUNTRY_OPTIONS.map((c) => ({ value: c.value, label: c.label }))}
              />
            )}
          />
        </Field>
        <Field label={t("venue.timezone")} hint={t("venue.timezoneHint")}>
          <Controller
            control={control}
            name="hotel.timezone"
            render={({ field }) => (
              <SelectField
                value={field.value || undefined}
                onChange={field.onChange}
                placeholder={t("venue.timezoneAuto")}
                options={TIMEZONE_OPTIONS.map((tz) => ({ value: tz.value, label: `${tz.label} (${tz.offset})` }))}
              />
            )}
          />
        </Field>
        <Field label={t("venue.access")} hint={t("venue.accessHint")}>
          <Textarea rows={3} {...register("hotel.access_instructions")} />
        </Field>
        <Field label={t("venue.accessEn")}>
          <Textarea rows={3} {...register("hotel.access_instructions_en")} />
        </Field>
      </div>
    </form>
  );
}
