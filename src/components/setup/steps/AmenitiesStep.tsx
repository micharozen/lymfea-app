import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { amenitiesSchema, toNumOrNull } from "@/lib/venueSetup/schemas";
import { AMENITY_TYPES } from "@shared/venueSetup/spec";
import { Field, SwitchRow } from "../SetupFields";
import { boolOr, numOrNull, sectionList, str, type StepProps } from "../types";

type Values = z.infer<typeof amenitiesSchema>;

export function AmenitiesStep({ state, formId, onSave }: StepProps) {
  const { t } = useTranslation("setup");
  const saved = new Map(sectionList(state, "venue_amenities").map((a) => [a.type as string, a]));

  const form = useForm<Values>({
    resolver: zodResolver(amenitiesSchema),
    defaultValues: {
      venue_amenities: AMENITY_TYPES.map((type) => {
        const a = saved.get(type) ?? {};
        return {
          enabled: saved.has(type),
          type,
          capacity_per_slot: numOrNull(a.capacity_per_slot) ?? 10,
          slot_duration: numOrNull(a.slot_duration) ?? 60,
          is_exclusive: boolOr(a.is_exclusive, false),
          prep_time: numOrNull(a.prep_time) ?? 0,
          price_external: numOrNull(a.price_external),
          lymfea_access_included: boolOr(a.lymfea_access_included, true),
          lymfea_access_duration: numOrNull(a.lymfea_access_duration) ?? 60,
          opening_time: str(a.opening_time),
          closing_time: str(a.closing_time),
        };
      }),
    },
  });
  const { register, control, handleSubmit, watch } = form;

  const submit = (v: Values) =>
    onSave({
      venue_amenities: v.venue_amenities.filter((a) => a.enabled).map(({ enabled: _enabled, ...rest }) => rest),
    });

  const num = (i: number, name: "capacity_per_slot" | "slot_duration" | "prep_time" | "price_external" | "lymfea_access_duration") =>
    register(`venue_amenities.${i}.${name}`, { setValueAs: toNumOrNull });

  return (
    <form id={formId} onSubmit={handleSubmit(submit)} className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("amenities.intro")}</p>
      {AMENITY_TYPES.map((type, i) => {
        const enabled = watch(`venue_amenities.${i}.enabled`);
        const included = watch(`venue_amenities.${i}.lymfea_access_included`);
        return (
          <div key={type} className="rounded-lg border">
            <label className="flex items-center justify-between gap-4 p-3 cursor-pointer">
              <span className="text-sm">{t(`amenities.types.${type}`)}</span>
              <Controller
                control={control}
                name={`venue_amenities.${i}.enabled`}
                render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
              />
            </label>
            {enabled && (
              <div className="border-t p-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("amenities.capacity")}>
                    <Input type="number" min={1} {...num(i, "capacity_per_slot")} />
                  </Field>
                  <Field label={t("amenities.slotDuration")}>
                    <Input type="number" min={15} step={15} {...num(i, "slot_duration")} />
                  </Field>
                  <Field label={t("amenities.prepTime")}>
                    <Input type="number" min={0} step={5} {...num(i, "prep_time")} />
                  </Field>
                  <Field label={t("amenities.priceExternal")}>
                    <Input type="number" min={0} step="0.01" {...num(i, "price_external")} />
                  </Field>
                </div>
                <Controller
                  control={control}
                  name={`venue_amenities.${i}.is_exclusive`}
                  render={({ field }) => (
                    <SwitchRow
                      label={t("amenities.exclusive")}
                      hint={t("amenities.exclusiveHint")}
                      checked={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name={`venue_amenities.${i}.lymfea_access_included`}
                  render={({ field }) => (
                    <SwitchRow label={t("amenities.included")} checked={field.value} onChange={field.onChange} />
                  )}
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  {included && (
                    <Field label={t("amenities.includedDuration")}>
                      <Input type="number" min={0} step={15} {...num(i, "lymfea_access_duration")} />
                    </Field>
                  )}
                  <Field label={t("amenities.opening")} hint={t("amenities.hoursHint")}>
                    <Input type="time" {...register(`venue_amenities.${i}.opening_time`)} />
                  </Field>
                  <Field label={t("amenities.closing")}>
                    <Input type="time" {...register(`venue_amenities.${i}.closing_time`)} />
                  </Field>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </form>
  );
}
