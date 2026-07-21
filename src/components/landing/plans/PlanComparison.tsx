import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Check, Clock, Minus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { PLAN_SECTIONS, type PlanMark, type PlanValue } from "./planMatrix";

interface PublicPlan {
  code: string;
  monthly_amount_cents: number | null;
  currency: string;
}

const MARK_STYLES: Record<PlanMark, { Icon: typeof Check; className: string }> = {
  yes: { Icon: Check, className: "text-emerald-600" },
  no: { Icon: X, className: "text-muted-foreground/30" },
  soon: { Icon: Clock, className: "text-sky-600" },
  onRequest: { Icon: Minus, className: "text-amber-500" },
};

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

const PlanCell = ({ value }: { value: PlanValue }) => {
  const { t } = useTranslation("landing");

  if (typeof value === "object") {
    return (
      <span className="text-sm text-foreground/90">
        {t(`planComparison.values.${value.valueKey}`)}
      </span>
    );
  }

  const { Icon, className } = MARK_STYLES[value];
  return (
    <span className="inline-flex items-center justify-center">
      <Icon className={cn("h-[18px] w-[18px]", className)} aria-hidden />
      <span className="sr-only">{t(`planComparison.legend.${value}`)}</span>
    </span>
  );
};

export const PlanComparison = () => {
  const { t } = useTranslation("landing");

  // Même queryKey que <Pricing /> : le cache est partagé, pas de requête en double.
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

  const plansByCode = new Map((plansQuery.data ?? []).map((p) => [p.code, p]));
  const starter = plansByCode.get("starter");
  const pro = plansByCode.get("pro");

  const legendItems: PlanMark[] = ["yes", "onRequest", "soon", "no"];

  return (
    <section id="plan-comparison" className="py-24 md:py-32">
      <div className="container mx-auto px-4 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-2xl text-center"
        >
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
            {t("planComparison.eyebrow")}
          </span>
          <h2 className="mt-3 font-serif text-3xl tracking-tight text-foreground md:text-5xl">
            {t("planComparison.title")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground md:text-xl">
            {t("planComparison.subtitle")}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mt-12 overflow-x-auto rounded-2xl border border-border/60"
        >
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40">
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-muted/40 px-4 py-4 text-left font-medium text-muted-foreground"
                >
                  {t("planComparison.table.feature")}
                </th>
                <th scope="col" className="px-4 py-4 text-center">
                  <span className="block font-serif text-base text-foreground">
                    {t("pricing.starter.name")}
                  </span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    {formatPrice(starter?.monthly_amount_cents, starter?.currency ?? "eur")}
                    {t("planComparison.table.perMonth")}
                  </span>
                </th>
                <th scope="col" className="bg-gold-50 px-4 py-4 text-center">
                  <span className="block font-serif text-base text-foreground">
                    {t("pricing.pro.name")}
                  </span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    {formatPrice(pro?.monthly_amount_cents, pro?.currency ?? "eur")}
                    {t("planComparison.table.perMonth")}
                  </span>
                </th>
              </tr>
            </thead>

            {PLAN_SECTIONS.map((section) => (
              <tbody key={section.key}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={3}
                    className="border-b border-border/40 bg-background px-4 pb-2 pt-7 text-left text-xs font-medium uppercase tracking-[0.16em] text-primary"
                  >
                    {t(`planComparison.sections.${section.key}`)}
                  </th>
                </tr>

                {section.rows.map((row) => (
                  <tr key={row.key} className="border-b border-border/40 last:border-0">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-background px-4 py-3.5 text-left font-normal"
                    >
                      <span
                        className={cn(
                          "block text-foreground/90",
                          row.highlight && "font-medium text-foreground",
                        )}
                      >
                        {t(`planComparison.rows.${row.key}.label`)}
                      </span>
                      {t(`planComparison.rows.${row.key}.note`, { defaultValue: "" }) && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {t(`planComparison.rows.${row.key}.note`)}
                        </span>
                      )}
                    </th>
                    <td className="px-4 py-3.5 text-center align-middle">
                      <PlanCell value={row.starter} />
                    </td>
                    <td className="bg-gold-50/60 px-4 py-3.5 text-center align-middle">
                      <PlanCell value={row.pro} />
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </motion.div>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          {legendItems.map((mark) => {
            const { Icon, className } = MARK_STYLES[mark];
            return (
              <span key={mark} className="inline-flex items-center gap-1.5">
                <Icon className={cn("h-4 w-4", className)} aria-hidden />
                {t(`planComparison.legend.${mark}`)}
              </span>
            );
          })}
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          {t("planComparison.footnote")}
        </p>
      </div>
    </section>
  );
};
