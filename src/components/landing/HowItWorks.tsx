import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion, useScroll, useSpring } from "framer-motion";
import { Check } from "lucide-react";

const EASE = [0.16, 1, 0.3, 1] as const;

const STEPS = ["scoping", "migration", "training", "launch"] as const;
const OURS = ["pms", "data", "training", "followup"] as const;
const YOURS = ["call", "hour"] as const;

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
        {/* Encadrement de tableau : moulure, marie-louise, puis le fond.
            Le cadre est l'argument : le parcours entier tient dans un périmètre
            dessiné à l'avance et tenu par nous. */}
        <div className="rounded-2xl border border-gold-600/35 bg-gradient-to-b from-gold-300 via-gold-200 to-gold-400 p-3 shadow-[0_30px_80px_-45px_rgba(116,99,48,0.55)] md:p-4">
          <div className="rounded-lg border border-gold-600/30 bg-card p-6 md:p-10 lg:p-14">
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.7, ease: EASE }}
              className="max-w-2xl"
            >
              <h2 className="pb-1 font-serif text-3xl leading-[1.1] tracking-tight text-foreground md:text-5xl">
                {t("howItWorks.title")}{" "}
                <span className="italic text-primary">{t("howItWorks.titleHighlight")}</span>
                <span className="text-primary">.</span>
              </h2>
              <p className="mt-5 text-base leading-relaxed text-muted-foreground md:text-lg">
                {t("howItWorks.subtitle")}
              </p>
            </motion.div>

            <div className="mt-12 grid gap-10 lg:grid-cols-12 lg:gap-14 md:mt-14">
              {/* Le calendrier : quatre repères, rien de plus. */}
              <ol ref={railRef} className="relative lg:col-span-5">
                <div
                  aria-hidden
                  className="absolute bottom-2 left-[7px] top-2 w-px bg-border"
                >
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
                      className="absolute left-0 top-1 flex h-[15px] w-[15px] items-center justify-center rounded-full border border-gold-500 bg-card"
                    >
                      <span className="h-[5px] w-[5px] rounded-full bg-gold-500" />
                    </span>
                    <span className="font-grotesk text-xs font-medium uppercase tracking-[0.25em] text-gold-600">
                      {t(`howItWorks.steps.${step}.when`)}
                    </span>
                    <h3 className="mt-1.5 font-serif text-xl text-foreground md:text-2xl">
                      {t(`howItWorks.steps.${step}.title`)}
                    </h3>
                  </motion.li>
                ))}
              </ol>

              {/* Le partage des tâches, montré une seule fois : quatre lignes
                  contre deux. */}
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
                className="grid content-start gap-4 lg:col-span-7"
              >
                <div className="rounded-xl border border-gold-300 bg-gold-50/70 p-5 md:p-6">
                  <p className="text-xs font-medium text-foreground/70">
                    {t("howItWorks.lanes.ours.title")}
                  </p>
                  <ul className="mt-4 space-y-2.5">
                    {OURS.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2.5 text-sm leading-relaxed text-foreground md:text-base"
                      >
                        <Check aria-hidden className="mt-1 h-4 w-4 shrink-0 text-primary" />
                        <span>{t(`howItWorks.lanes.ours.items.${item}`)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-dashed border-gold-400 p-5">
                  <p className="text-xs font-medium text-foreground/70">
                    {t("howItWorks.lanes.yours.title")}
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {YOURS.map((item) => (
                      <li
                        key={item}
                        className="text-sm leading-relaxed text-muted-foreground md:text-base"
                      >
                        {t(`howItWorks.lanes.yours.items.${item}`)}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
