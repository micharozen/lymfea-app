import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  CalendarRange,
  CreditCard,
  Gift,
  Plug,
  Smartphone,
  Sparkles,
} from "lucide-react";

const FEATURES = [
  { key: "pms", Icon: Plug },
  { key: "agenda", Icon: CalendarRange },
  { key: "pwa", Icon: Smartphone },
  { key: "booking", Icon: Sparkles },
  { key: "billing", Icon: CreditCard },
  { key: "giftcards", Icon: Gift },
] as const;

export const FeaturesGrid = () => {
  const { t } = useTranslation("landing");

  return (
    <section id="features" className="py-24 md:py-32">
      <div className="container mx-auto px-4 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-2xl text-center"
        >
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
            {t("features.eyebrow")}
          </span>
          <h2 className="mt-3 font-serif text-3xl tracking-tight text-foreground md:text-5xl">
            {t("features.title")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground md:text-xl">
            {t("features.subtitle")}
          </p>
        </motion.div>

        <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <motion.article
              key={feature.key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}
              whileHover={{ y: -4 }}
              className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 transition-colors hover:border-gold-400 md:p-7"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-gold-100 to-gold-200 text-gold-800 transition-transform duration-300 group-hover:scale-105">
                <feature.Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-serif text-xl text-foreground">
                {t(`features.${feature.key}.title`)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t(`features.${feature.key}.desc`)}
              </p>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold-400 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
};
