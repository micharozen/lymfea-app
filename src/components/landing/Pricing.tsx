import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { BRAND_DEMO_CTA } from "./constants";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import {
  createCheckoutSession,
  createBillingPortalSession,
  type PlanCode,
  type BillingCycle,
} from "@/lib/billing";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

interface PublicPlan {
  code: PlanCode;
  name: string;
  monthly_amount_cents: number | null;
  yearly_amount_cents: number | null;
  currency: string;
  is_active: boolean;
}

function formatPrice(cents: number | null | undefined, currency: string): string {
  if (cents == null) return "—";
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${Math.round(cents / 100)} ${currency.toUpperCase()}`;
  }
}

export const Pricing = () => {
  const { t } = useTranslation("landing");
  const navigate = useNavigate();
  const { userId, organizationId, isAdmin, loading: userLoading } = useUser();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [busyPlan, setBusyPlan] = useState<PlanCode | null>(null);

  const plansQuery = useQuery<PublicPlan[]>({
    queryKey: ["public-plans"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select(
          "code, name, monthly_amount_cents, yearly_amount_cents, currency, is_active",
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data as PublicPlan[]) ?? [];
    },
  });

  const plansByCode = new Map(
    (plansQuery.data ?? []).map((p) => [p.code, p]),
  );

  async function handleSelectPlan(code: PlanCode) {
    if (code === "enterprise") {
      window.location.href = BRAND_DEMO_CTA;
      return;
    }

    if (userLoading) {
      // UserContext still fetching session — wait, don't redirect to /auth.
      return;
    }

    if (!userId) {
      navigate(`/signup?plan=${code}&cycle=${cycle}`);
      return;
    }

    if (!isAdmin || !organizationId) {
      toast.error(
        t("pricing.errors.adminRequired", {
          defaultValue: "Only organization admins can subscribe.",
        }),
      );
      return;
    }

    setBusyPlan(code);
    try {
      const successUrl = `${window.location.origin}/admin/billing?checkout=success`;
      const cancelUrl = `${window.location.origin}/admin/billing?checkout=cancelled`;
      const { data, error } = await createCheckoutSession({
        plan_code: code,
        billing_cycle: cycle,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      if (error && /already has an active subscription/i.test(error.message)) {
        // Org already subscribed — send them to the portal instead.
        const { data: portal, error: portalError } = await createBillingPortalSession({
          return_url: `${window.location.origin}/admin/billing`,
        });
        if (portalError || !portal?.url) {
          toast.error(portalError?.message ?? "Could not open billing portal");
          return;
        }
        window.location.href = portal.url;
        return;
      }

      if (error || !data?.url) {
        toast.error(error?.message ?? "Could not start checkout");
        return;
      }

      window.location.href = data.url;
    } finally {
      setBusyPlan(null);
    }
  }

  const starterPlan = plansByCode.get("starter");
  const proPlan = plansByCode.get("pro");

  const starterAmount =
    cycle === "yearly" ? starterPlan?.yearly_amount_cents : starterPlan?.monthly_amount_cents;
  const proAmount =
    cycle === "yearly" ? proPlan?.yearly_amount_cents : proPlan?.monthly_amount_cents;

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

          <div className="mt-8 inline-flex items-center rounded-full border border-border/60 bg-card p-1">
            <button
              type="button"
              onClick={() => setCycle("monthly")}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm transition",
                cycle === "monthly"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("pricing.cycle.monthly", { defaultValue: "Mensuel" })}
            </button>
            <button
              type="button"
              onClick={() => setCycle("yearly")}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm transition",
                cycle === "yearly"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("pricing.cycle.yearly", { defaultValue: "Annuel" })}
              <span className="ml-1 text-xs text-primary">
                {t("pricing.cycle.yearlyHint", { defaultValue: "−2 mois" })}
              </span>
            </button>
          </div>
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
                <span className="font-serif text-5xl text-foreground md:text-6xl">
                  {formatPrice(starterAmount, starterPlan?.currency ?? "eur")}
                </span>
                <span className="text-sm text-muted-foreground">
                  /{cycle === "yearly" ? t("pricing.unit.year", { defaultValue: "an" }) : t("pricing.starter.unit")}
                </span>
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
              size="lg"
              variant="outline"
              className="group mt-10 h-12 w-full border-foreground/20 bg-transparent text-base text-foreground hover:bg-foreground/5"
              disabled={busyPlan === "starter"}
              onClick={() => handleSelectPlan("starter")}
            >
              {busyPlan === "starter" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("pricing.starter.cta")}
              <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
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
                <span className="font-serif text-5xl text-foreground md:text-6xl">
                  {formatPrice(proAmount, proPlan?.currency ?? "eur")}
                </span>
                <span className="text-sm text-muted-foreground">
                  /{cycle === "yearly" ? t("pricing.unit.year", { defaultValue: "an" }) : t("pricing.pro.unit")}
                </span>
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
              size="lg"
              className="group mt-10 h-12 w-full bg-foreground text-base text-background hover:bg-foreground/90"
              disabled={busyPlan === "pro"}
              onClick={() => handleSelectPlan("pro")}
            >
              {busyPlan === "pro" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("pricing.pro.cta")}
              <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
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
