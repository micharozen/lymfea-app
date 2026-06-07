import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

interface UpgradePromptProps {
  feature: string;
  className?: string;
}

export function UpgradePrompt({ feature, className }: UpgradePromptProps) {
  const { t } = useTranslation("admin");

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center ${className ?? ""}`}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Lock className="h-5 w-5" />
      </div>
      <div>
        <h3 className="text-base font-medium">
          {t("billing.upgrade.title", "Feature locked")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("billing.upgrade.description", {
            feature,
            defaultValue: `Upgrade your plan to unlock “${feature}”.`,
          })}
        </p>
      </div>
      <Button asChild size="sm">
        <Link to="/admin/billing">
          {t("billing.upgrade.cta", "Manage subscription")}
        </Link>
      </Button>
    </div>
  );
}
