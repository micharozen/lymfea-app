import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { pmsSchema } from "@/lib/venueSetup/schemas";
import { ChoiceCards, Field, SectionTitle, SwitchRow } from "../SetupFields";
import { boolOr, sectionObject, str, type StepProps } from "../types";

type Values = z.infer<typeof pmsSchema>;

export function PmsStep({ state, formId, onSave }: StepProps) {
  const { t } = useTranslation("setup");
  const h = sectionObject(state, "hotel");
  const c = sectionObject(state, "pms_contact");

  const form = useForm<Values>({
    resolver: zodResolver(pmsSchema),
    defaultValues: {
      hotel: {
        pms_type: (h.pms_type as Values["hotel"]["pms_type"]) ?? "none",
        pms_auto_charge_room: boolOr(h.pms_auto_charge_room, false),
        pms_guest_lookup_enabled: boolOr(h.pms_guest_lookup_enabled, false),
      },
      pms_contact: { name: str(c.name), email: str(c.email), phone: str(c.phone) },
    },
  });
  const { register, control, handleSubmit, watch, formState } = form;
  const hasPms = watch("hotel.pms_type") !== "none";

  return (
    <form id={formId} onSubmit={handleSubmit((v) => onSave(v))} className="space-y-5">
      <Field label={t("pms.type")}>
        <Controller
          control={control}
          name="hotel.pms_type"
          render={({ field }) => (
            <ChoiceCards
              value={field.value}
              onChange={field.onChange}
              columns={4}
              options={[
                { value: "opera_cloud", label: "Oracle Opera Cloud" },
                { value: "mews", label: "Mews" },
                { value: "other", label: t("pms.other") },
                { value: "none", label: t("pms.none") },
              ]}
            />
          )}
        />
      </Field>

      {hasPms && (
        <>
          <Controller
            control={control}
            name="hotel.pms_auto_charge_room"
            render={({ field }) => (
              <SwitchRow label={t("pms.roomCharge")} hint={t("pms.roomChargeHint")} checked={field.value} onChange={field.onChange} />
            )}
          />
          <Controller
            control={control}
            name="hotel.pms_guest_lookup_enabled"
            render={({ field }) => (
              <SwitchRow label={t("pms.guestLookup")} hint={t("pms.guestLookupHint")} checked={field.value} onChange={field.onChange} />
            )}
          />

          <SectionTitle title={t("pms.contactTitle")} description={t("pms.contactDesc")} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("fields.name")}>
              <Input {...register("pms_contact.name")} />
            </Field>
            <Field label={t("fields.email")} error={formState.errors.pms_contact?.email?.message}>
              <Input type="email" {...register("pms_contact.email")} />
            </Field>
            <Field label={t("fields.phone")}>
              <Input type="tel" {...register("pms_contact.phone")} />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground rounded-lg bg-muted/50 p-3">{t("payment.noSecrets")}</p>
        </>
      )}
    </form>
  );
}
