import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation, Trans } from "react-i18next";
import { CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";

const CATEGORIES = ["integration", "technical", "billing", "account", "other"] as const;

const supportSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  company: z.string().trim().min(1).max(160),
  category: z.enum(CATEGORIES),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(10).max(5000),
  // Honeypot : invisible pour l'utilisateur, rempli par les bots.
  website: z.string().max(255),
});

type SupportFormValues = z.infer<typeof supportSchema>;

export const SupportForm = () => {
  const { t } = useTranslation("support");
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SupportFormValues>({
    resolver: zodResolver(supportSchema),
    defaultValues: {
      name: "",
      email: "",
      company: "",
      category: undefined,
      subject: "",
      message: "",
      website: "",
    },
  });

  const onSubmit = async (values: SupportFormValues) => {
    setSubmitError(null);
    const { error } = await invokeEdgeFunction("support-request", {
      body: values,
      skipAuth: true,
      logContext: { flow: "landing_support_form" },
    });

    if (error) {
      setSubmitError(t("errors.submit"));
      return;
    }

    reset();
    setSent(true);
  };

  if (sent) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-8 text-center md:p-12">
        <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
        <h2 className="mt-4 font-serif text-2xl text-foreground">{t("success.title")}</h2>
        <p className="mx-auto mt-3 max-w-md text-base text-muted-foreground">
          {t("success.description")}
        </p>
        <Button variant="outline" className="mt-6" onClick={() => setSent(false)}>
          {t("success.again")}
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="rounded-2xl border border-border/60 bg-card p-6 md:p-8"
    >
      <h2 className="font-serif text-2xl text-foreground">{t("form.title")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("form.description")}</p>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="support-name">{t("form.name")}</Label>
          <Input
            id="support-name"
            autoComplete="name"
            placeholder={t("form.namePlaceholder")}
            {...register("name")}
          />
          {errors.name && <p className="text-sm text-destructive">{t("errors.name")}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="support-email">{t("form.email")}</Label>
          <Input
            id="support-email"
            type="email"
            autoComplete="email"
            placeholder={t("form.emailPlaceholder")}
            {...register("email")}
          />
          {errors.email && <p className="text-sm text-destructive">{t("errors.email")}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="support-company">{t("form.company")}</Label>
          <Input
            id="support-company"
            autoComplete="organization"
            placeholder={t("form.companyPlaceholder")}
            {...register("company")}
          />
          {errors.company && <p className="text-sm text-destructive">{t("errors.company")}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="support-category">{t("form.category")}</Label>
          <Controller
            control={control}
            name="category"
            render={({ field }) => (
              <SelectField
                options={CATEGORIES.map((value) => ({
                  value,
                  label: t(`form.categories.${value}`),
                }))}
                value={field.value}
                onChange={field.onChange}
                placeholder={t("form.categoryPlaceholder")}
                searchable={false}
                className="w-full"
                aria-label={t("form.category")}
              />
            )}
          />
          {errors.category && <p className="text-sm text-destructive">{t("errors.category")}</p>}
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="support-subject">{t("form.subject")}</Label>
          <Input
            id="support-subject"
            placeholder={t("form.subjectPlaceholder")}
            {...register("subject")}
          />
          {errors.subject && <p className="text-sm text-destructive">{t("errors.subject")}</p>}
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="support-message">{t("form.message")}</Label>
          <Textarea
            id="support-message"
            rows={7}
            placeholder={t("form.messagePlaceholder")}
            {...register("message")}
          />
          {errors.message && <p className="text-sm text-destructive">{t("errors.message")}</p>}
        </div>
      </div>

      {/* Honeypot : masqué visuellement et ignoré par les lecteurs d'écran. */}
      <div aria-hidden className="hidden">
        <label htmlFor="support-website">Website</label>
        <input id="support-website" tabIndex={-1} autoComplete="off" {...register("website")} />
      </div>

      {submitError && <p className="mt-6 text-sm text-destructive">{submitError}</p>}

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-muted-foreground sm:max-w-sm">
          <Trans
            i18nKey="form.privacy"
            ns="support"
            components={[<a key="privacy" href="/privacy" className="underline hover:text-foreground" />]}
          />
        </p>
        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="bg-foreground text-background hover:bg-foreground/90"
        >
          {isSubmitting ? (
            t("form.submitting")
          ) : (
            <>
              {t("form.submit")}
              <Send className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
};
