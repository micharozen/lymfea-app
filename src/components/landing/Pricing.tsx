import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRAND_DEMO_CTA } from "./constants";

const STARTER_FEATURES = ["agenda", "pwa", "booking", "billing", "support"] as const;
const PRO_FEATURES = [
  "everythingStarter",
  "pms",
  "autoBilling",
  "giftcards",
  "multiTherapist",
  "prioritySupport",
] as const;
const ENTERPRISE_FEATURES = [
  "multivenue",
  "branding",
  "sla",
  "dedicatedCSM",
  "customIntegrations",
] as const;

export const Pricing = () => {
  const { t } = useTranslation("landing");

  return (
    <section id="pricing" className="py-24 md:py-32">
      <div className="container mx-auto px-4 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-2xl text-center"
        >
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
            {t("pricing.eyebrow")}
          </span>
          <h2 className="mt-3 font-serif text-3xl tracking-tight text-foreground md:text-5xl">
            {t("pricing.title")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground md:text-xl">
            {t("pricing.subtitle")}
          </p>
        </motion.div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3 lg:items-start">
          {/* Starter tier */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-8 md:p-10"
          >
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
              {t("pricing.starter.name")}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{t("pricing.starter.tagline")}</p>

            <div className="mt-6">
              <div className="text-sm text-muted-foreground">{t("pricing.starter.priceFrom")}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-serif text-5xl text-foreground md:text-6xl">149 €</span>
                <span className="text-sm text-muted-foreground">{t("pricing.starter.unit")}</span>
              </div>
            </div>

            <ul className="mt-8 space-y-3">
              {STARTER_FEATURES.map((key) => (
                <li key={key} className="flex items-start gap-3 text-sm text-foreground">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Check className="h-3 w-3" />
                  </span>
                  {t(`pricing.starter.features.${key}`)}
                </li>
              ))}
            </ul>

            <Button
              asChild
              size="lg"
              variant="outline"
              className="group mt-10 h-12 w-full border-foreground/20 bg-transparent text-base text-foreground hover:bg-foreground/5"
            >
              <a href={BRAND_DEMO_CTA}>
                {t("pricing.starter.cta")}
                <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {t("pricing.starter.note")}
            </p>
          </motion.div>

          {/* Pro tier — highlighted */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="relative overflow-hidden rounded-3xl border-2 border-gold-400 bg-card p-8 shadow-[0_30px_60px_-20px_rgba(150,110,60,0.18)] md:p-10 lg:-mt-4 lg:mb-4"
          >
            <div className="absolute right-6 top-6">
              <span className="inline-flex items-center rounded-full bg-gold-100 px-3 py-1 text-xs font-medium text-gold-800">
                {t("pricing.pro.badge")}
              </span>
            </div>

            <div className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
              {t("pricing.pro.name")}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{t("pricing.pro.tagline")}</p>

            <div className="mt-6">
              <div className="text-sm text-muted-foreground">{t("pricing.pro.priceFrom")}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-serif text-5xl text-foreground md:text-6xl">249 €</span>
                <span className="text-sm text-muted-foreground">{t("pricing.pro.unit")}</span>
              </div>
            </div>

            <ul className="mt-8 space-y-3">
              {PRO_FEATURES.map((key) => (
                <li key={key} className="flex items-start gap-3 text-sm text-foreground">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Check className="h-3 w-3" />
                  </span>
                  {t(`pricing.pro.features.${key}`)}
                </li>
              ))}
            </ul>

            <Button
              asChild
              size="lg"
              className="group mt-10 h-12 w-full bg-foreground text-base text-background hover:bg-foreground/90"
            >
              <a href={BRAND_DEMO_CTA}>
                {t("pricing.pro.cta")}
                <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {t("pricing.pro.note")}
            </p>
          </motion.div>

          {/* Enterprise tier */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-foreground via-foreground to-[#2a1f10] p-8 text-background md:p-10"
          >
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-gold-400">
              {t("pricing.enterprise.name")}
            </div>
            <p className="mt-2 text-sm text-background/70">{t("pricing.enterprise.tagline")}</p>

            <div className="mt-6">
              <div className="text-sm text-background/70">{t("pricing.enterprise.priceLabel")}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-serif text-5xl text-background md:text-6xl">
                  {t("pricing.enterprise.price")}
                </span>
              </div>
            </div>

            <ul className="mt-8 space-y-3">
              {ENTERPRISE_FEATURES.map((key) => (
                <li key={key} className="flex items-start gap-3 text-sm text-background/90">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-500/20 text-gold-400">
                    <Check className="h-3 w-3" />
                  </span>
                  {t(`pricing.enterprise.features.${key}`)}
                </li>
              ))}
            </ul>

            <Button
              asChild
              size="lg"
              variant="outline"
              className="group mt-10 h-12 w-full border-background/30 bg-transparent text-base text-background hover:bg-background/10 hover:text-background"
            >
              <a href={BRAND_DEMO_CTA}>
                {t("pricing.enterprise.cta")}
                <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
            </Button>
            <p className="mt-3 text-center text-xs text-background/60">
              {t("pricing.enterprise.note")}
            </p>
          </motion.div>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-10 text-center text-sm text-muted-foreground"
        >
          {t("pricing.footnote")}
        </motion.p>
      </div>
    </section>
  );
};
