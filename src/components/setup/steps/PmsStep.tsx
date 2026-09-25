import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { pmsSchema } from "@/lib/venueSetup/schemas";
import { ChoiceCards, Field, SwitchRow } from "../SetupFields";
import { boolOr, sectionObject, type StepProps } from "../types";

type Values = z.infer<typeof pmsSchema>;

const pmsLogo = (src: string, alt: string) => (
  <img src={src} alt={alt} className="h-6 w-6 rounded-md object-contain flex-shrink-0" />
);

export function PmsStep({ state, formId, onSave }: StepProps) {
  const { t } = useTranslation("setup");
  const h = sectionObject(state, "hotel");

  const form = useForm<Values>({
    resolver: zodResolver(pmsSchema),
    defaultValues: {
      hotel: {
        pms_type: (h.pms_type as Values["hotel"]["pms_type"]) ?? "none",
        pms_auto_charge_room: boolOr(h.pms_auto_charge_room, false),
        pms_guest_lookup_enabled: boolOr(h.pms_guest_lookup_enabled, false),
      },
    },
  });
  const { control, handleSubmit, watch } = form;
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
                { value: "opera_cloud", label: "Oracle Opera Cloud", icon: pmsLogo("/images/logos/pms/oracle.png", "Oracle") },
                { value: "mews", label: "Mews", icon: pmsLogo("/images/logos/pms/mews.svg", "Mews") },
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
        </>
      )}
    </form>
  );
}
