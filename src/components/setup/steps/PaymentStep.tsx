import { useTranslation } from "react-i18next";
import { CreditCard, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StepProps } from "../types";

const STRIPE_CONNECT_DOC_URL = "https://saoma.notion.site/stripe-connect?source=copy_link";

/**
 * Informational step: Stripe is connected by OAuth from the admin once the
 * venue exists (fixed redirect URL, authenticated flow), so nothing is asked
 * here. Submitting just marks the step as seen.
 */
export function PaymentStep({ formId, onSave }: StepProps) {
  const { t } = useTranslation("setup");

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        onSave({});
      }}
    >
      <div className="rounded-xl border bg-card p-5 flex gap-4">
        <CreditCard className="h-6 w-6 text-primary flex-shrink-0" />
        <div className="space-y-3">
          <p className="text-sm">{t("payment.laterTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("payment.laterText")}</p>
          <Button asChild variant="outline" size="sm">
            <a href={STRIPE_CONNECT_DOC_URL} target="_blank" rel="noreferrer">
              {t("payment.docLink")}
              <ExternalLink className="h-3.5 w-3.5 ml-2" />
            </a>
          </Button>
        </div>
      </div>
    </form>
  );
}
