import { useTranslation } from "react-i18next";
import { type UseFormReturn } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { slugify } from "@/lib/slugify";
import type { OnboardingValues } from "../schemas";

interface OrganizationStepProps {
  form: UseFormReturn<OnboardingValues>;
}

export function OrganizationStep({ form }: OrganizationStepProps) {
  const { t } = useTranslation("admin");
  const {
    register,
    watch,
    formState: { errors },
  } = form;

  const orgName = watch("organizationName");
  const previewSlug = slugify(orgName);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="organizationName">
          {t("onboarding.organization.name.label")}
        </Label>
        <Input
          id="organizationName"
          autoComplete="organization"
          placeholder={t("onboarding.organization.name.placeholder")}
          {...register("organizationName")}
        />
        {errors.organizationName && (
          <p className="text-xs text-destructive">
            {t("onboarding.organization.name.error")}
          </p>
        )}
        {previewSlug && (
          <p className="text-xs text-muted-foreground">
            {t("onboarding.organization.slugPreview", { slug: previewSlug })}
          </p>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        {t("onboarding.organization.helper")}
      </p>
    </div>
  );
}
