import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";
import { Calendar, CheckCircle2, Clock, Mail, Sparkles, User } from "lucide-react";

const EASE = [0.16, 1, 0.3, 1] as const;

// Étapes du pipeline, déclenchées par la progression du scroll dans la section épinglée
const STAGE = {
  email: 1,
  flow1: 2,
  agent: 3,
  step2: 4,
  step3: 5,
  flow2: 6,
  booking: 7,
  badge: 8,
} as const;
const THRESHOLDS = [0.04, 0.16, 0.24, 0.34, 0.44, 0.54, 0.64, 0.76];

const useIsDesktop = () => {
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia("(min-width: 768px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
};

// Progression du scroll dans la section épinglée (0 → 1).
// Mesuré via getBoundingClientRect + écoute en capture : le scroll de la page
// se produit sur <body> (html/body ont une hauteur fixée dans index.css),
// donc window.scrollY reste à 0 et useScroll() de framer-motion ne voit rien.
const useSectionProgress = (ref: React.RefObject<HTMLElement>, enabled: boolean) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setProgress(0);
      return;
    }

    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const { top, height } = el.getBoundingClientRect();
      const distance = height - window.innerHeight;
      setProgress(distance <= 0 ? 0 : Math.min(1, Math.max(0, -top / distance)));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [enabled, ref]);

  return progress;
};

export const AiSpotlight = () => {
  const { t } = useTranslation("landing");
  const reduce = useReducedMotion();
  const isDesktop = useIsDesktop();
  const scrub = isDesktop && !reduce;

  const wrapRef = useRef<HTMLElement>(null);
  const progress = useSectionProgress(wrapRef, scrub);
  const stage = THRESHOLDS.filter((threshold) => progress >= threshold).length;

  const reached = (s: number) => !scrub || stage >= s;

  // Props d'animation : pilotées par le scroll (desktop) ou simple reveal (mobile / reduced)
  const drive = (s: number, hidden: object, visible: object, duration = 0.7) =>
    scrub
      ? { initial: hidden, animate: reached(s) ? visible : hidden, transition: { duration, ease: EASE } }
      : {
          initial: reduce ? false : hidden,
          whileInView: visible,
          viewport: { once: true, amount: 0.3 },
          transition: { duration, ease: EASE },
        };

  const agentActive = scrub ? stage >= STAGE.agent && stage < STAGE.booking : false;

  return (
    <section ref={wrapRef} id="ai-spotlight" className={`relative ${scrub ? "md:-mt-24 md:h-[260vh]" : ""}`}>
      <div
        className={`relative overflow-hidden py-24 ${
          scrub ? "md:sticky md:top-0 md:flex md:min-h-screen md:flex-col md:justify-center md:py-0" : "md:py-32"
        }`}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-gold-100/30 via-transparent to-transparent" />

        <div className="container relative mx-auto px-4 md:px-6">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="mx-auto max-w-2xl text-center"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-400/40 bg-gold-100/60 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-gold-800">
              <Sparkles className="h-3 w-3" />
              {t("aiSpotlight.eyebrow")}
            </span>
            <h2 className="mt-4 font-serif text-3xl tracking-tight text-foreground md:text-5xl">
              {t("aiSpotlight.title")}
            </h2>
            <p className="mt-4 text-lg text-muted-foreground md:text-xl">
              {t("aiSpotlight.subtitle")}
            </p>
          </motion.div>

          <div className="mt-16 grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_3rem_1.15fr_3rem_1fr] md:gap-0">
            {/* 1. L'email arrive */}
            <motion.article
              {...drive(STAGE.email, { opacity: 0, x: -20 }, { opacity: 1, x: 0 })}
              className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm"
            >
              <div className="flex items-center gap-2 border-b border-border/60 pb-3 text-xs text-muted-foreground">
                <Mail className="h-4 w-4 text-gold-800" />
                <span className="font-medium uppercase tracking-wider">
                  {t("aiSpotlight.email.label")}
                </span>
              </div>
              <div className="mt-4 space-y-1.5 text-sm">
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">{t("aiSpotlight.email.fromLabel")}</span>{" "}
                  {t("aiSpotlight.email.fromValue")}
                </p>
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">{t("aiSpotlight.email.subjectLabel")}</span>{" "}
                  {t("aiSpotlight.email.subjectValue")}
                </p>
              </div>
              <p className="mt-4 text-sm italic leading-relaxed text-foreground/80">
                “{t("aiSpotlight.email.body")}”
              </p>
            </motion.article>

            <FlowConnector active={reached(STAGE.flow1)} show={scrub} />

            {/* 2. L'agent IA traite */}
            <motion.article
              animate={scrub ? { opacity: reached(STAGE.agent) ? 1 : 0.45 } : undefined}
              transition={{ duration: 0.5, ease: EASE }}
              className="relative overflow-hidden rounded-2xl border border-gold-400/50 bg-gradient-to-br from-gold-100/70 via-card to-card p-6 shadow-md md:p-7"
            >
              {agentActive && (
                <motion.div
                  aria-hidden
                  animate={{ opacity: [0.35, 0.7, 0.35] }}
                  transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
                  className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-gold-400/25 via-transparent to-gold-400/10"
                />
              )}
              <div className="relative">
                <div className="flex items-center justify-between border-b border-gold-400/30 pb-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gold-800">
                    <Sparkles className="h-4 w-4" />
                    {t("aiSpotlight.agent.label")}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-gold-800/80">
                    <span className="relative flex h-2 w-2">
                      {agentActive && (
                        <motion.span
                          animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
                          transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
                          className="absolute inline-flex h-full w-full rounded-full bg-gold-400"
                        />
                      )}
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-400" />
                    </span>
                    {t("aiSpotlight.agent.status")}
                  </span>
                </div>
                <ul className="mt-4 min-h-[7rem] space-y-3">
                  {(["step1", "step2", "step3"] as const).map((key, i) => (
                    <motion.li
                      key={key}
                      {...drive(
                        STAGE.agent + i,
                        { opacity: 0, x: -8 },
                        { opacity: 1, x: 0 },
                        0.4,
                      )}
                      className="flex items-start gap-2.5 text-sm text-foreground"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-gold-400" />
                      <span className="leading-snug">{t(`aiSpotlight.agent.${key}`)}</span>
                    </motion.li>
                  ))}
                </ul>
              </div>
            </motion.article>

            <FlowConnector active={reached(STAGE.flow2)} show={scrub} />

            {/* 3. La réservation se matérialise */}
            <motion.article
              {...drive(STAGE.booking, { opacity: 0, scale: 0.96, y: 10 }, { opacity: 1, scale: 1, y: 0 })}
              className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm"
            >
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-gold-800">
                  <Calendar className="h-4 w-4" />
                  {t("aiSpotlight.booking.label")}
                </span>
                <motion.span
                  {...drive(STAGE.badge, { opacity: 0 }, { opacity: 1 }, 0.4)}
                  className="rounded-full bg-gold-100 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gold-800"
                >
                  {t("aiSpotlight.booking.status")}
                </motion.span>
              </div>
              <h3 className="mt-4 font-serif text-xl text-foreground">
                {t("aiSpotlight.booking.title")}
              </h3>
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gold-800" />
                  {t("aiSpotlight.booking.client")}
                </p>
                <p className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gold-800" />
                  {t("aiSpotlight.booking.slot")}
                </p>
              </div>
            </motion.article>
          </div>
        </div>
      </div>
    </section>
  );
};

// L'impulsion qui voyage d'une carte à l'autre (desktop épinglé uniquement)
const FlowConnector = ({ active, show }: { active: boolean; show: boolean }) => (
  <div aria-hidden>
    <div className="relative mx-2 hidden h-px bg-gold-400/40 md:block">
      {show && (
        <motion.span
          initial={{ x: 0, opacity: 0 }}
          animate={active ? { x: 24, opacity: [0, 1, 1, 0] } : { x: 0, opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeInOut" }}
          className="absolute -top-[3px] left-0 h-[7px] w-[7px] rounded-full bg-gold-500"
        />
      )}
    </div>
    <div className="relative mx-auto h-10 w-px bg-gold-400/40 md:hidden" />
  </div>
);
