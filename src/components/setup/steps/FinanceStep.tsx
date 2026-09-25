import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { financeSchema, toNumOrNull } from "@/lib/venueSetup/schemas";
import { ChoiceCards, Field, SectionTitle, SwitchRow } from "../SetupFields";
import { numOrNull, sectionObject, str, type StepProps } from "../types";

type Values = z.infer<typeof financeSchema>;

const BILLING_KEYS = [
  "company_name",
  "siret",
  "tva_number",
  "billing_address",
  "billing_postal_code",
  "billing_city",
  "billing_country",
  "contact_email",
] as const;

export function FinanceStep({ state, formId, onSave }: StepProps) {
  const { t } = useTranslation("setup");
  const h = sectionObject(state, "hotel");
  const vbp = state.data.venue_billing_profile as Record<string, unknown> | null | undefined;

  const form = useForm<Values>({
    resolver: zodResolver(financeSchema),
    defaultValues: {
      hotel: {
        currency: str(h.currency) || "EUR",
        vat: numOrNull(h.vat) ?? 20,
        hotel_commission: numOrNull(h.hotel_commission),
        therapist_commission: numOrNull(h.therapist_commission),
        invoice_client: (h.invoice_client as Values["hotel"]["invoice_client"]) ?? "organization",
      },
      has_venue_billing_profile: !!vbp,
      venue_billing_profile: Object.fromEntries(BILLING_KEYS.map((k) => [k, str(vbp?.[k])])) as Values["venue_billing_profile"],
    },
  });
  const { register, control, handleSubmit, watch, formState } = form;
  const e = formState.errors;
  const hasOwn = watch("has_venue_billing_profile");

  const submit = (v: Values) =>
    onSave({
      hotel: { ...v.hotel, currency: (v.hotel.currency || "EUR").toUpperCase() },
      venue_billing_profile: v.has_venue_billing_profile ? v.venue_billing_profile : null,
    });

  const num = (name: "hotel.vat" | "hotel.hotel_commission" | "hotel.therapist_commission") =>
    register(name, { setValueAs: toNumOrNull });

  return (
    <form id={formId} onSubmit={handleSubmit(submit)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("finance.currency")}>
          <Input maxLength={3} {...register("hotel.currency")} />
        </Field>
        <Field label={t("finance.vat")} error={e.hotel?.vat?.message}>
          <Input type="number" min={0} max={100} step="0.1" {...num("hotel.vat")} />
        </Field>
        <Field label={t("finance.venueCommission")} error={e.hotel?.hotel_commission?.message}>
          <Input type="number" min={0} max={100} step="0.1" {...num("hotel.hotel_commission")} />
        </Field>
        <Field label={t("finance.therapistCommission")} error={e.hotel?.therapist_commission?.message}>
          <Input type="number" min={0} max={100} step="0.1" {...num("hotel.therapist_commission")} />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">{t("finance.commissionHint")}</p>

      <Field label={t("finance.invoiceClient")} hint={t("finance.invoiceClientHint")}>
        <Controller
          control={control}
          name="hotel.invoice_client"
          render={({ field }) => (
            <ChoiceCards
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: "organization", label: t("finance.invoiceOrg") },
                { value: "venue", label: t("finance.invoiceVenue") },
              ]}
            />
          )}
        />
      </Field>

      <Controller
        control={control}
        name="has_venue_billing_profile"
        render={({ field }) => (
          <SwitchRow label={t("finance.ownEntity")} hint={t("finance.ownEntityHint")} checked={field.value} onChange={field.onChange} />
        )}
      />

      {hasOwn && (
        <>
          <SectionTitle title={t("finance.venueEntity")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("company.legalName")}>
              <Input {...register("venue_billing_profile.company_name")} />
            </Field>
            <Field label={t("company.siret")} error={e.venue_billing_profile?.siret?.message}>
              <Input inputMode="numeric" {...register("venue_billing_profile.siret")} />
            </Field>
            <Field label={t("company.vatNumber")}>
              <Input {...register("venue_billing_profile.tva_number")} />
            </Field>
            <Field label={t("company.billingEmail")} error={e.venue_billing_profile?.contact_email?.message}>
              <Input type="email" {...register("venue_billing_profile.contact_email")} />
            </Field>
            <Field label={t("company.billingAddress")} className="sm:col-span-2">
              <Input {...register("venue_billing_profile.billing_address")} />
            </Field>
            <Field label={t("fields.postalCode")}>
              <Input {...register("venue_billing_profile.billing_postal_code")} />
            </Field>
            <Field label={t("fields.city")}>
              <Input {...register("venue_billing_profile.billing_city")} />
            </Field>
          </div>
        </>
      )}
    </form>
  );
}
