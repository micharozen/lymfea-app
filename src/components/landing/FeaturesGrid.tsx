import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

const CELLS = [
  { key: "visibility", bullets: ["agenda", "payments", "pms"], className: "lg:col-span-2" },
  {
    key: "therapist",
    bullets: ["notifications", "availability", "addons", "invoicing"],
    className: "lg:col-span-2 bg-gold-100/50",
  },
  {
    key: "booking",
    bullets: ["frictionless", "response", "qr", "acquisition"],
    className: "lg:col-span-2",
  },
  { key: "basket", bullets: ["analytics", "addons", "carts"], className: "lg:col-span-2 bg-gold-100/50" },
  { key: "reporting", bullets: ["dashboard", "reports"], className: "md:col-span-2 lg:col-span-4" },
] as const;

export const FeaturesGrid = () => {
  const { t } = useTranslation("landing");
  const reduce = useReducedMotion();

  return (
    <section id="features" className="py-24 md:py-32">
      <div className="container mx-auto px-4 md:px-6">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="max-w-2xl"
        >
          <h2 className="pb-1 font-serif text-3xl leading-[1.1] tracking-tight text-foreground md:text-5xl">
            {t("features.title")}{" "}
            <span className="italic text-primary">{t("features.titleHighlight")}</span>
            <span className="text-primary">.</span>
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            {t("features.subtitle")}
          </p>
        </motion.div>

        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          {CELLS.map((cell, i) => (
            <motion.article
              key={cell.key}
              initial={reduce ? false : { opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.6, ease: EASE, delay: i * 0.08 }}
              className={`rounded-2xl border border-border/60 bg-card p-6 transition-colors hover:border-gold-400 md:p-7 ${cell.className}`}
            >
              <h3 className="font-serif text-xl text-foreground md:text-2xl">
                {t(`features.items.${cell.key}.title`)}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {cell.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
                    <span aria-hidden className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-gold-500" />
                    {t(`features.items.${cell.key}.bullets.${bullet}`)}
                  </li>
                ))}
              </ul>
              {cell.key === "reporting" && <ReportingPreview />}
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
};

// Aperçu illustratif, données factices (comme les mockups du Hero)
const ReportingPreview = () => (
  <div aria-hidden className="mt-6 grid grid-cols-3 gap-2">
    <PreviewStat label="CA du mois" value="42 380 €" />
    <PreviewStat label="Occupation" value="87 %" />
    <PreviewStat label="Prévision J+7" value="92 %" />
  </div>
);

const PreviewStat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="mt-0.5 font-serif text-base text-foreground md:text-lg">{value}</div>
  </div>
);
