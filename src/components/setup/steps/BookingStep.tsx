import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form } from "@/components/ui/form";
import { SelectField } from "@/components/ui/select-field";
import { CancellationTiersEditor } from "@/components/admin/venue/CancellationTiersEditor";
import { parseCancellationTiers } from "@/lib/cancellationTiers";
import { bookingSchema, toNumOrNull } from "@/lib/venueSetup/schemas";
import { ChoiceCards, Field, SectionTitle, SwitchRow } from "../SetupFields";
import { boolOr, numOrNull, sectionObject, str, type StepProps } from "../types";

type Values = z.infer<typeof bookingSchema>;

const NOTICE_MINUTES = [0, 30, 60, 120, 240, 720, 1440, 2880];
const SLOT_INTERVALS = [15, 30, 60];

export function BookingStep({ state, formId, onSave }: StepProps) {
  const { t } = useTranslation("setup");
  const h = sectionObject(state, "hotel");

  const form = useForm<Values>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      hotel: {
        min_booking_notice_minutes: numOrNull(h.min_booking_notice_minutes) ?? 120,
        auto_validate_bookings: boolOr(h.auto_validate_bookings, false),
        client_payment_mode:
          (h.client_payment_mode as Values["hotel"]["client_payment_mode"]) ?? "pre_authorization",
        allow_out_of_hours_booking: boolOr(h.allow_out_of_hours_booking, false),
        out_of_hours_surcharge_percent: numOrNull(h.out_of_hours_surcharge_percent),
        room_turnover_buffer_minutes: numOrNull(h.room_turnover_buffer_minutes) ?? 15,
        slot_interval: numOrNull(h.slot_interval) ?? 30,
        client_cancellation_cutoff_hours: numOrNull(h.client_cancellation_cutoff_hours) ?? 24,
        client_reschedule_cutoff_hours: numOrNull(h.client_reschedule_cutoff_hours) ?? 24,
        cancellation_policy_text_fr: str(h.cancellation_policy_text_fr),
        cancellation_policy_text_en: str(h.cancellation_policy_text_en),
      },
      cancellation_tiers: parseCancellationTiers(h.cancellation_tiers),
    },
  });
  const { register, control, handleSubmit, watch, formState } = form;
  const e = formState.errors.hotel;
  const outOfHours = watch("hotel.allow_out_of_hours_booking");

  const noticeLabel = (m: number) =>
    m === 0 ? t("booking.noticeNone") : m < 60 ? t("booking.minutes", { n: m }) : t("booking.hours", { n: m / 60 });

  const submit = (v: Values) =>
    onSave({ hotel: { ...v.hotel, cancellation_tiers: v.cancellation_tiers } });

  return (
    <Form {...form}>
      <form id={formId} onSubmit={handleSubmit(submit)} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("booking.notice")} hint={t("booking.noticeHint")}>
            <Controller
              control={control}
              name="hotel.min_booking_notice_minutes"
              render={({ field }) => (
                <SelectField
                  searchable={false}
                  value={field.value === null || field.value === undefined ? undefined : String(field.value)}
                  onChange={(v) => field.onChange(Number(v))}
                  options={NOTICE_MINUTES.map((m) => ({ value: String(m), label: noticeLabel(m) }))}
                />
              )}
            />
          </Field>
          <Field label={t("booking.slotInterval")} hint={t("booking.slotIntervalHint")}>
            <Controller
              control={control}
              name="hotel.slot_interval"
              render={({ field }) => (
                <SelectField
                  searchable={false}
                  value={field.value === null || field.value === undefined ? undefined : String(field.value)}
                  onChange={(v) => field.onChange(Number(v))}
                  options={SLOT_INTERVALS.map((m) => ({ value: String(m), label: t("booking.minutes", { n: m }) }))}
                />
              )}
            />
          </Field>
          <Field label={t("booking.turnover")} hint={t("booking.turnoverHint")} error={e?.room_turnover_buffer_minutes?.message}>
            <Input type="number" min={0} max={120} step={5} {...register("hotel.room_turnover_buffer_minutes", { setValueAs: toNumOrNull })} />
          </Field>
        </div>

        <Controller
          control={control}
          name="hotel.auto_validate_bookings"
          render={({ field }) => (
            <SwitchRow label={t("booking.autoValidate")} hint={t("booking.autoValidateHint")} checked={field.value} onChange={field.onChange} />
          )}
        />

        <Field label={t("booking.paymentMode")}>
          <Controller
            control={control}
            name="hotel.client_payment_mode"
            render={({ field }) => (
              <ChoiceCards
                value={field.value}
                onChange={field.onChange}
                options={[
                  { value: "pre_authorization", label: t("booking.preAuth"), hint: t("booking.preAuthHint") },
                  { value: "pay_at_booking", label: t("booking.payNow"), hint: t("booking.payNowHint") },
                ]}
              />
            )}
          />
        </Field>

        <Controller
          control={control}
          name="hotel.allow_out_of_hours_booking"
          render={({ field }) => (
            <SwitchRow label={t("booking.outOfHours")} hint={t("booking.outOfHoursHint")} checked={field.value} onChange={field.onChange} />
          )}
        />
        {outOfHours && (
          <Field label={t("booking.surcharge")} error={e?.out_of_hours_surcharge_percent?.message} className="max-w-[220px]">
            <Input type="number" min={0} max={100} {...register("hotel.out_of_hours_surcharge_percent", { setValueAs: toNumOrNull })} />
          </Field>
        )}

        <SectionTitle title={t("booking.cancellationTitle")} />
        <div className="grid gap-4 grid-cols-2">
          <Field label={t("booking.cancelCutoff")} hint={t("booking.cancelCutoffHint")} error={e?.client_cancellation_cutoff_hours?.message}>
            <Input type="number" min={0} max={168} {...register("hotel.client_cancellation_cutoff_hours", { setValueAs: toNumOrNull })} />
          </Field>
          <Field label={t("booking.rescheduleCutoff")} hint={t("booking.rescheduleCutoffHint")} error={e?.client_reschedule_cutoff_hours?.message}>
            <Input type="number" min={0} max={168} {...register("hotel.client_reschedule_cutoff_hours", { setValueAs: toNumOrNull })} />
          </Field>
        </div>

        <Field label={t("booking.tiers")} hint={t("booking.tiersHint")}>
          <CancellationTiersEditor form={form} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("booking.policyFr")}>
            <Textarea rows={4} {...register("hotel.cancellation_policy_text_fr")} />
          </Field>
          <Field label={t("booking.policyEn")}>
            <Textarea rows={4} {...register("hotel.cancellation_policy_text_en")} />
          </Field>
        </div>
      </form>
    </Form>
  );
}
