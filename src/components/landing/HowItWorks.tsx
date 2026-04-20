import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";

const STEPS = ["step1", "step2", "step3"] as const;

export const HowItWorks = () => {
  const { t } = useTranslation("landing");

  return (
    <section id="how-it-works" className="border-y border-border/60 bg-gold-50/50 py-24 md:py-32">
      <div className="container mx-auto px-4 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-2xl text-center"
        >
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
            {t("howItWorks.eyebrow")}
          </span>
          <h2 className="mt-3 font-serif text-3xl tracking-tight text-foreground md:text-5xl">
            {t("howItWorks.title")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground md:text-xl">
            {t("howItWorks.subtitle")}
          </p>
        </motion.div>

        <div className="relative mt-16">
          {/* Animated connecting line (desktop only) */}
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
            style={{ transformOrigin: "left" }}
            className="absolute left-[15%] right-[15%] top-10 hidden h-px bg-gradient-to-r from-transparent via-gold-400 to-transparent md:block"
          />

          <div className="relative grid gap-8 md:grid-cols-3 md:gap-10">
            {STEPS.map((step, i) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.15 }}
                className="relative flex flex-col items-start text-left md:items-center md:text-center"
              >
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-gold-300 bg-card shadow-sm">
                  <span className="font-serif text-2xl text-primary">
                    {t(`howItWorks.${step}.number`)}
                  </span>
                </div>
                <h3 className="mt-6 font-serif text-2xl text-foreground">
                  {t(`howItWorks.${step}.title`)}
                </h3>
                <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  {t(`howItWorks.${step}.desc`)}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
