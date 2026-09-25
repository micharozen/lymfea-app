import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { hoursSchema } from "@/lib/venueSetup/schemas";
import { ChoiceCards, DaysPicker, Field, SectionTitle } from "../SetupFields";
import { sectionList, sectionObject, str, type StepProps } from "../types";

type Values = z.infer<typeof hoursSchema>;
type Mode = "always_open" | "specific_days" | "seasonal";

export function HoursStep({ state, formId, onSave }: StepProps) {
  const { t } = useTranslation("setup");
  const hotel = sectionObject(state, "hotel");
  const schedule = sectionObject(state, "venue_deployment_schedule");
  const slots = sectionList(state, "venue_blocked_slots");

  const form = useForm<Values>({
    resolver: zodResolver(hoursSchema),
    defaultValues: {
      hotel: {
        opening_time: str(hotel.opening_time) || "10:00",
        closing_time: str(hotel.closing_time) || "20:00",
      },
      venue_deployment_schedule: {
        schedule_type: (schedule.schedule_type as Values["venue_deployment_schedule"]["schedule_type"]) ?? "always_open",
        days_of_week: (schedule.days_of_week as number[]) ?? [],
        recurring_start_date: str(schedule.recurring_start_date),
        recurring_end_date: str(schedule.recurring_end_date),
      },
      venue_blocked_slots: slots.map((s) => ({
        label: str(s.label),
        start_time: str(s.start_time),
        end_time: str(s.end_time),
        days_of_week: (s.days_of_week as number[]) ?? [],
        block_date: str(s.block_date),
      })),
    },
  });
  const { register, control, handleSubmit, watch, setValue, formState } = form;
  const errors = formState.errors;
  const { fields, append, remove } = useFieldArray({ control, name: "venue_blocked_slots" });

  const scheduleType = watch("venue_deployment_schedule.schedule_type");
  const hasSeason = !!watch("venue_deployment_schedule.recurring_start_date");
  const mode: Mode = scheduleType === "always_open" ? "always_open" : hasSeason ? "seasonal" : "specific_days";

  const setMode = (m: Mode) => {
    setValue("venue_deployment_schedule.schedule_type", m === "always_open" ? "always_open" : "specific_days");
    if (m === "seasonal" && !hasSeason) {
      setValue("venue_deployment_schedule.recurring_start_date", new Date().toISOString().slice(0, 10));
    }
    if (m !== "seasonal") {
      setValue("venue_deployment_schedule.recurring_start_date", "");
      setValue("venue_deployment_schedule.recurring_end_date", "");
    }
  };

  const submit = (v: Values) => {
    const s = v.venue_deployment_schedule;
    onSave({
      hotel: v.hotel,
      venue_deployment_schedule: {
        ...s,
        days_of_week: s.schedule_type === "always_open" ? [] : s.days_of_week,
      },
      venue_blocked_slots: v.venue_blocked_slots,
    });
  };

  return (
    <form id={formId} onSubmit={handleSubmit(submit)} className="space-y-5">
      <div className="grid gap-4 grid-cols-2">
        <Field label={t("hours.opening")} hint={t("hours.openingHint")}>
          <Input type="time" {...register("hotel.opening_time")} />
        </Field>
        <Field label={t("hours.closing")} hint={t("hours.closingHint")} error={errors.hotel?.closing_time?.message}>
          <Input type="time" {...register("hotel.closing_time")} />
        </Field>
      </div>

      <Field label={t("hours.days")}>
        <ChoiceCards
          value={mode}
          onChange={setMode}
          columns={3}
          options={[
            { value: "always_open", label: t("hours.alwaysOpen") },
            { value: "specific_days", label: t("hours.specificDays") },
            { value: "seasonal", label: t("hours.seasonal"), hint: t("hours.seasonalHint") },
          ]}
        />
      </Field>

      {mode !== "always_open" && (
        <Field label={t("hours.pickDays")} error={errors.venue_deployment_schedule?.days_of_week?.message}>
          <Controller
            control={control}
            name="venue_deployment_schedule.days_of_week"
            render={({ field }) => <DaysPicker value={field.value ?? []} onChange={field.onChange} />}
          />
        </Field>
      )}

      {mode === "seasonal" && (
        <div className="grid gap-4 grid-cols-2">
          <Field label={t("hours.seasonStart")}>
            <Input type="date" {...register("venue_deployment_schedule.recurring_start_date")} />
          </Field>
          <Field label={t("hours.seasonEnd")}>
            <Input type="date" {...register("venue_deployment_schedule.recurring_end_date")} />
          </Field>
        </div>
      )}

      <SectionTitle title={t("hours.closuresTitle")} description={t("hours.closuresDesc")} />
      <div className="space-y-3">
        {fields.map((f, i) => {
          const e = errors.venue_blocked_slots?.[i];
          return (
            <div key={f.id} className="rounded-lg border p-3 space-y-3">
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-[1fr_110px_110px_auto] items-end">
                <Field label={t("hours.closureLabel")} required error={e?.label?.message} className="col-span-2 sm:col-span-1">
                  <Input placeholder={t("hours.closureLabelPlaceholder")} {...register(`venue_blocked_slots.${i}.label`)} />
                </Field>
                <Field label={t("hours.from")} required error={e?.start_time?.message}>
                  <Input type="time" {...register(`venue_blocked_slots.${i}.start_time`)} />
                </Field>
                <Field label={t("hours.to")} required error={e?.end_time?.message}>
                  <Input type="time" {...register(`venue_blocked_slots.${i}.end_time`)} />
                </Field>
                <Button type="button" variant="ghost" size="icon" aria-label={t("common.remove")} onClick={() => remove(i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Field label={t("hours.closureDays")} error={e?.days_of_week?.message}>
                <Controller
                  control={control}
                  name={`venue_blocked_slots.${i}.days_of_week`}
                  render={({ field }) => <DaysPicker value={field.value ?? []} onChange={field.onChange} />}
                />
              </Field>
              <Field label={t("hours.closureDate")} hint={t("hours.closureDateHint")} className="max-w-[220px]">
                <Input type="date" {...register(`venue_blocked_slots.${i}.block_date`)} />
              </Field>
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ label: "", start_time: "13:00", end_time: "14:00", days_of_week: [], block_date: "" })}
        >
          <Plus className="h-4 w-4 mr-2" />
          {t("hours.addClosure")}
        </Button>
      </div>
    </form>
  );
}
