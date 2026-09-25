import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { paymentSchema } from "@/lib/venueSetup/schemas";
import { ChoiceCards, Field, SwitchRow } from "../SetupFields";
import { boolOr, sectionObject, str, type StepProps } from "../types";

type Values = z.infer<typeof paymentSchema>;

export function PaymentStep({ state, formId, onSave }: StepProps) {
  const { t } = useTranslation("setup");
  const p = sectionObject(state, "payment");

  const form = useForm<Values>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      payment: {
        provider: (p.provider as Values["payment"]["provider"]) ?? "stripe",
        has_account: boolOr(p.has_account, false),
        account_owner_email: str(p.account_owner_email),
        contact: str(p.contact),
      },
    },
  });
  const { register, control, handleSubmit, watch, formState } = form;
  const provider = watch("payment.provider");

  return (
    <form id={formId} onSubmit={handleSubmit((v) => onSave(v))} className="space-y-5">
      <p className="text-sm text-muted-foreground">{t("payment.intro")}</p>

      <Field label={t("payment.provider")}>
        <Controller
          control={control}
          name="payment.provider"
          render={({ field }) => (
            <ChoiceCards
              value={field.value}
              onChange={field.onChange}
              columns={3}
              options={[
                { value: "stripe", label: "Stripe" },
                { value: "adyen", label: "Adyen" },
                { value: "none", label: t("payment.none") },
              ]}
            />
          )}
        />
      </Field>

      {provider !== "none" && (
        <Controller
          control={control}
          name="payment.has_account"
          render={({ field }) => (
            <SwitchRow label={t("payment.hasAccount")} checked={field.value} onChange={field.onChange} />
          )}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t("payment.ownerEmail")}
          hint={t("payment.ownerEmailHint")}
          error={formState.errors.payment?.account_owner_email?.message}
        >
          <Input type="email" {...register("payment.account_owner_email")} />
        </Field>
        <Field label={t("payment.contact")} hint={t("payment.contactHint")}>
          <Input {...register("payment.contact")} />
        </Field>
      </div>

      <p className="text-xs text-muted-foreground rounded-lg bg-muted/50 p-3">{t("payment.noSecrets")}</p>
    </form>
  );
}
