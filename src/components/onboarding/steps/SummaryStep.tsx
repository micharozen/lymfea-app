import { useTranslation } from "react-i18next";
import { type UseFormReturn } from "react-hook-form";
import { ShieldCheck, CreditCard, CalendarClock } from "lucide-react";
import type { OnboardingValues } from "../schemas";

interface SummaryStepProps {
  form: UseFormReturn<OnboardingValues>;
}

export function SummaryStep({ form }: SummaryStepProps) {
  const { t } = useTranslation("admin");
  const v = form.getValues();

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold">{t("onboarding.summary.organization")}</h3>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <dt className="text-muted-foreground">{t("onboarding.summary.fields.orgName")}</dt>
          <dd className="font-medium">{v.organizationName}</dd>
          <dt className="text-muted-foreground">{t("onboarding.summary.fields.admin")}</dt>
          <dd className="font-medium">
            {v.firstName} {v.lastName}
          </dd>
          <dt className="text-muted-foreground">{t("onboarding.summary.fields.email")}</dt>
          <dd className="font-medium truncate">{v.email}</dd>
          <dt className="text-muted-foreground">{t("onboarding.summary.fields.phone")}</dt>
          <dd className="font-medium">{v.phone}</dd>
        </dl>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold">{t("onboarding.summary.venue")}</h3>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <dt className="text-muted-foreground">{t("onboarding.summary.fields.type")}</dt>
          <dd className="font-medium capitalize">
            {t(`onboarding.venue.type.${v.venueType}`)}
          </dd>
          <dt className="text-muted-foreground">{t("onboarding.summary.fields.name")}</dt>
          <dd className="font-medium">{v.venueName}</dd>
          <dt className="text-muted-foreground">{t("onboarding.summary.fields.address")}</dt>
          <dd className="font-medium">{v.venueAddress}</dd>
          {(v.venuePostalCode || v.venueCity) && (
            <>
              <dt className="text-muted-foreground">{t("onboarding.summary.fields.cityZip")}</dt>
              <dd className="font-medium">
                {[v.venuePostalCode, v.venueCity].filter(Boolean).join(" ")}
              </dd>
            </>
          )}
          {v.venueCountry && (
            <>
              <dt className="text-muted-foreground">{t("onboarding.summary.fields.country")}</dt>
              <dd className="font-medium">{v.venueCountry}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold">{t("onboarding.summary.plan")}</h3>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <dt className="text-muted-foreground">{t("onboarding.summary.fields.tier")}</dt>
          <dd className="font-medium capitalize">{v.planCode}</dd>
          <dt className="text-muted-foreground">{t("onboarding.summary.fields.cycle")}</dt>
          <dd className="font-medium">
            {t(`onboarding.plan.cycle.${v.billingCycle}`)}
          </dd>
        </dl>
      </div>

      <div className="rounded-lg bg-muted/50 p-3 space-y-2 text-xs">
        <div className="flex items-start gap-2">
          <CalendarClock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <span>{t("onboarding.summary.trial")}</span>
        </div>
        <div className="flex items-start gap-2">
          <CreditCard className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <span>{t("onboarding.summary.card")}</span>
        </div>
        <div className="flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <span>{t("onboarding.summary.secure")}</span>
        </div>
      </div>
    </div>
  );
}
