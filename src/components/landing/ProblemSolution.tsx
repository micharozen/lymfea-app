import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

const POINTS = ["fragmented", "followup", "analytics"] as const;

export const ProblemSolution = () => {
  const { t } = useTranslation("landing");
  const reduce = useReducedMotion();

  return (
    <section className="border-y border-border/60 bg-gold-50/50 py-24 md:py-32">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid gap-14 lg:grid-cols-12 lg:gap-10">
          {/* Left: anchored title, sticky on desktop */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="lg:col-span-5"
          >
            <div className="lg:sticky lg:top-28">
              <span aria-hidden className="block h-px w-12 bg-gold-400" />
              <h2 className="mt-6 max-w-md font-serif text-3xl leading-[1.1] tracking-tight text-foreground md:text-5xl">
                {t("problem.title")}
              </h2>
              <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground md:text-lg">
                {t("problem.subtitle")}
              </p>
            </div>
          </motion.div>

          {/* Right: the register, each entry written in as its rule is drawn */}
          <div className="lg:col-span-6 lg:col-start-7">
            {POINTS.map((key, i) => (
              <motion.div
                key={key}
                initial={reduce ? "visible" : "hidden"}
                whileInView="visible"
                viewport={{ once: true, amount: 0.6 }}
                className="pt-10 pb-12 first:pt-0 last:pb-0 md:pt-12 md:pb-14"
              >
                <motion.span
                  aria-hidden
                  variants={{
                    hidden: { scaleX: 0 },
                    visible: {
                      scaleX: 1,
                      transition: { duration: 0.8, ease: EASE, delay: i * 0.15 },
                    },
                  }}
                  className="block h-px origin-left bg-gold-400/70"
                />
                <motion.div
                  variants={{
                    hidden: { opacity: 0, y: 12 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: { duration: 0.6, ease: EASE, delay: 0.3 + i * 0.15 },
                    },
                  }}
                >
                  <span className="mt-7 block font-grotesk text-xs font-medium tracking-[0.25em] text-gold-600">
                    {`0${i + 1}`}
                  </span>
                  <h3 className="mt-3 font-serif text-2xl text-foreground md:text-3xl">
                    {t(`problem.points.${key}.title`)}
                  </h3>
                  <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground md:text-base">
                    {t(`problem.points.${key}.desc`)}
                  </p>
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
