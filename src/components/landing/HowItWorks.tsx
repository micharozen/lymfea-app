import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion, useScroll, useSpring } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

const STEPS = ["scoping", "migration", "training", "launch"] as const;
const LANES = ["ours", "yours"] as const;

export const HowItWorks = () => {
  const { t } = useTranslation("landing");
  const reduce = useReducedMotion();
  const railRef = useRef<HTMLOListElement>(null);

  // Le trait doré se remplit au rythme du scroll : c'est l'avancement du
  // déploiement, pas une décoration.
  const { scrollYProgress } = useScroll({
    target: railRef,
    offset: ["start 80%", "end 75%"],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 80, damping: 26, restDelta: 0.001 });

  return (
    <section id="how-it-works" className="border-y border-border/60 bg-gold-50/50 py-24 md:py-32">
      <div className="container mx-auto px-4 md:px-6">
        <motion.h2
          initial={reduce ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="max-w-2xl font-serif text-3xl leading-[1.1] tracking-tight text-foreground md:text-5xl"
        >
          {t("howItWorks.title")}
        </motion.h2>

        <div className="mt-12 grid gap-10 md:mt-14 lg:grid-cols-12 lg:gap-14">
          {/* Le calendrier : quatre repères, rien de plus. */}
          <ol ref={railRef} className="relative lg:col-span-5">
            <div aria-hidden className="absolute bottom-2 left-[7px] top-2 w-px bg-border">
              <motion.div
                style={{ scaleY: reduce ? 1 : progress }}
                className="h-full w-full origin-top bg-gold-500"
              />
            </div>

            {STEPS.map((step, i) => (
              <motion.li
                key={step}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.5, ease: EASE, delay: i * 0.08 }}
                className="relative pb-8 pl-8 last:pb-0"
              >
                <span
                  aria-hidden
                  className="absolute left-0 top-1.5 flex h-[15px] w-[15px] items-center justify-center rounded-full border border-gold-500 bg-card"
                >
                  <span className="h-[5px] w-[5px] rounded-full bg-gold-500" />
                </span>
                {/* Le repère et l'étape tiennent sur une ligne : quatre libellés
                    en petites capitales au-dessus de quatre titres faisaient
                    quatre fois le même effet. */}
                <h3 className="font-serif text-xl text-foreground md:text-2xl">
                  <span className="text-gold-600">{t(`howItWorks.steps.${step}.when`)}</span>
                  <span aria-hidden className="text-muted-foreground/40">
                    {" · "}
                  </span>
                  {t(`howItWorks.steps.${step}.title`)}
                </h3>
              </motion.li>
            ))}
          </ol>

          {/* Le partage des tâches : une ligne de chaque côté. */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
            className="grid content-start gap-8 lg:col-span-7"
          >
            {LANES.map((lane) => (
              <div key={lane} className="border-t border-gold-300 pt-5">
                <p className="font-serif text-lg text-foreground md:text-xl">
                  {t(`howItWorks.lanes.${lane}.title`)}
                </p>
                <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
                  {t(`howItWorks.lanes.${lane}.line`)}
                </p>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
};
