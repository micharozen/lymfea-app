import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { companySchema } from "@/lib/venueSetup/schemas";
import { setupErrorCode, venueSetupApi } from "@/lib/venueSetup/api";
import { Field, FileUploadField, SectionTitle } from "../SetupFields";
import { sectionObject, str, type StepProps } from "../types";

type Values = z.infer<typeof companySchema>;

const ORG_KEYS = [
  "commercial_name",
  "legal_name",
  "legal_form",
  "legal_capital",
  "siren",
  "siret",
  "rcs",
  "vat_number",
  "legal_address",
  "legal_postal_code",
  "legal_city",
  "legal_country",
  "contact_email",
] as const;

export function CompanyStep({ token, state, formId, onSave }: StepProps) {
  const { t } = useTranslation("setup");
  const saved = sectionObject(state, "organization");
  const billing = sectionObject(state, "organization_billing_profile");
  const prefill = state.organization;

  // Saved answers win; otherwise what the organization already has.
  const orgDefault = (key: (typeof ORG_KEYS)[number]) =>
    str(saved[key]) || str(prefill?.[key]) || (key === "commercial_name" ? str(prefill?.name) : "");

  const form = useForm<Values>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      organization: {
        ...Object.fromEntries(ORG_KEYS.map((k) => [k, orgDefault(k)])),
        logo_path: (saved.logo_path as string | null) ?? null,
      } as Values["organization"],
      organization_billing_profile: {
        billing_address: str(billing.billing_address),
        billing_postal_code: str(billing.billing_postal_code),
        billing_city: str(billing.billing_city),
        billing_country: str(billing.billing_country),
        contact_email: str(billing.contact_email),
        contact_phone: str(billing.contact_phone),
      },
    },
  });
  const { register, formState, setValue, watch, handleSubmit } = form;
  const errors = formState.errors;
  const [looking, setLooking] = useState(false);

  const lookup = async () => {
    const siren = (watch("organization.siren") ?? "").replace(/\s/g, "");
    if (!/^\d{9}$/.test(siren)) {
      toast.error(t("errors.siren"));
      return;
    }
    setLooking(true);
    try {
      const { company } = await venueSetupApi.lookupCompany(token, siren);
      for (const key of ORG_KEYS) {
        if (key === "contact_email") continue;
        const value = company[key as keyof typeof company];
        if (value) setValue(`organization.${key}`, String(value), { shouldDirty: true });
      }
      toast.success(t("company.lookupDone"));
    } catch (error) {
      toast.error(setupErrorCode(error) === "not_found" ? t("company.lookupNotFound") : t("company.lookupFailed"));
    } finally {
      setLooking(false);
    }
  };

  const text = (name: `organization.${(typeof ORG_KEYS)[number]}`, labelKey: string, opts: { required?: boolean; hint?: string; className?: string } = {}) => {
    const key = name.split(".")[1] as (typeof ORG_KEYS)[number];
    return (
      <Field
        label={t(labelKey)}
        required={opts.required}
        hint={opts.hint}
        htmlFor={name}
        className={opts.className}
        error={errors.organization?.[key]?.message}
      >
        <Input id={name} {...register(name)} />
      </Field>
    );
  };

  return (
    <form id={formId} onSubmit={handleSubmit((v) => onSave(v))} className="space-y-5">
      <Field label={t("company.siren")} hint={t("company.sirenHint")} htmlFor="siren" error={errors.organization?.siren?.message}>
        <div className="flex gap-2">
          <Input id="siren" inputMode="numeric" placeholder="123456789" {...register("organization.siren")} />
          <Button type="button" variant="outline" onClick={lookup} disabled={looking}>
            {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-2 hidden sm:inline">{t("company.lookup")}</span>
          </Button>
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        {text("organization.commercial_name", "company.commercialName", { required: true, hint: t("company.commercialNameHint") })}
        {text("organization.legal_name", "company.legalName")}
        {text("organization.legal_form", "company.legalForm")}
        {text("organization.legal_capital", "company.legalCapital")}
        {text("organization.siret", "company.siret")}
        {text("organization.vat_number", "company.vatNumber")}
      </div>

      <SectionTitle title={t("company.headOffice")} />
      <div className="grid gap-4 sm:grid-cols-2">
        {text("organization.legal_address", "fields.address", { className: "sm:col-span-2" })}
        {text("organization.legal_postal_code", "fields.postalCode")}
        {text("organization.legal_city", "fields.city")}
        {text("organization.legal_country", "fields.country")}
        {text("organization.contact_email", "company.contactEmail")}
      </div>

      <SectionTitle title={t("company.billingTitle")} description={t("company.billingDesc")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("company.billingEmail")} error={errors.organization_billing_profile?.contact_email?.message}>
          <Input type="email" {...register("organization_billing_profile.contact_email")} />
        </Field>
        <Field label={t("company.billingPhone")}>
          <Input type="tel" {...register("organization_billing_profile.contact_phone")} />
        </Field>
        <Field label={t("company.billingAddress")} hint={t("company.billingAddressHint")} className="sm:col-span-2">
          <Input {...register("organization_billing_profile.billing_address")} />
        </Field>
        <Field label={t("fields.postalCode")}>
          <Input {...register("organization_billing_profile.billing_postal_code")} />
        </Field>
        <Field label={t("fields.city")}>
          <Input {...register("organization_billing_profile.billing_city")} />
        </Field>
      </div>

      <FileUploadField
        token={token}
        kind="org_logo"
        label={t("company.logo")}
        hint={t("upload.logoHint")}
        path={watch("organization.logo_path")}
        previewUrl={state.files[watch("organization.logo_path") ?? ""]}
        onChange={(p) => setValue("organization.logo_path", p, { shouldDirty: true })}
      />
    </form>
  );
}
