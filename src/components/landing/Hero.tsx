import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRAND_DEMO_CTA } from "./constants";
import { PhoneFrame } from "./PhoneFrame";

const EASE = [0.16, 1, 0.3, 1] as const;

// Captures de l'app locale (planning admin semaine, dashboard PWA thérapeute),
// mêmes données de démo que les captures des différenciateurs. Dimensions
// intrinsèques déclarées pour réserver la place avant le chargement (CLS).
const AGENDA = { src: "/images/landing/app-agenda-week.webp", width: 1600, height: 1156 };
const PWA = { src: "/images/landing/app-pwa-home.webp", width: 600, height: 1266 };

export const Hero = () => {
  const { t } = useTranslation("landing");
  const reduce = useReducedMotion();
  const enter = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, ease: EASE, delay },
  });

  return (
    <section id="top" className="relative overflow-hidden pt-28 md:pt-32">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[780px] -translate-x-1/2 rounded-full bg-gold-200/60 blur-[120px]"
      />

      <div className="container relative mx-auto px-4 pb-20 md:px-6 md:pb-28">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <motion.div {...enter(0)} className="flex flex-col items-start">
            <h1 className="pb-1 font-serif text-4xl leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              {t("hero.title")}{" "}
              <span className="italic text-primary">{t("hero.titleHighlight")}</span>
              <span className="text-primary">.</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl">
              {t("hero.subtitle")}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                asChild
                size="lg"
                className="group h-12 bg-foreground px-6 text-base text-background hover:bg-foreground/90"
              >
                <a href={BRAND_DEMO_CTA}>
                  {t("hero.ctaPrimary")}
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </a>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-12 border-foreground/20 bg-transparent px-6 text-base hover:bg-foreground/5"
              >
                <a href="#differentiators">{t("hero.ctaSecondary")}</a>
              </Button>
            </div>
          </motion.div>

          <motion.div {...enter(0.1)} className="relative lg:pl-6">
            <img
              src={AGENDA.src}
              width={AGENDA.width}
              height={AGENDA.height}
              alt={t("hero.agendaAlt")}
              fetchPriority="high"
              decoding="async"
              className="h-auto w-full rounded-xl border border-border/50 shadow-[0_24px_50px_-28px_rgba(80,60,30,0.45)]"
            />
            <PhoneFrame
              aria-hidden
              className="absolute -bottom-8 -left-4 hidden w-[150px] rounded-[1.65rem] p-[5px] md:w-[150px] md:rounded-[1.65rem] md:p-[5px] lg:block xl:w-[168px] xl:rounded-[1.8rem]"
              screenClassName="rounded-[1.35rem] md:rounded-[1.35rem] xl:rounded-[1.5rem]"
            >
              <img
                src={PWA.src}
                width={PWA.width}
                height={PWA.height}
                alt=""
                decoding="async"
                className="h-full w-full object-cover"
              />
            </PhoneFrame>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
