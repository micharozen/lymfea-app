import { useTranslation } from "react-i18next";
import { Mail } from "lucide-react";

interface EmailConfirmationGateProps {
  email: string;
}

export function EmailConfirmationGate({ email }: EmailConfirmationGateProps) {
  const { t } = useTranslation("admin");

  return (
    <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        <Mail className="h-7 w-7 text-primary" />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-lg font-semibold">
          {t("onboarding.emailConfirm.title")}
        </h3>
        <p className="text-sm text-muted-foreground max-w-md">
          {t("onboarding.emailConfirm.body", { email })}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("onboarding.emailConfirm.hint")}
      </p>
    </div>
  );
}
