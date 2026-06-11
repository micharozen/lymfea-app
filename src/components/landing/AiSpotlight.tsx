import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Mail,
  Sparkles,
  User,
} from "lucide-react";

export const AiSpotlight = () => {
  const { t } = useTranslation("landing");

  return (
    <section
      id="ai-spotlight"
      className="relative overflow-hidden py-24 md:py-32"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-gold-100/30 via-transparent to-transparent" />

      <div className="container relative mx-auto px-4 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
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

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mt-16 grid items-stretch gap-6 md:grid-cols-3 md:gap-5"
        >
          {/* Email mockup */}
          <article className="relative rounded-2xl border border-border/60 bg-card p-6 shadow-sm md:p-7">
            <div className="flex items-center gap-2 border-b border-border/60 pb-3 text-xs text-muted-foreground">
              <Mail className="h-4 w-4 text-gold-800" />
              <span className="font-medium uppercase tracking-wider">
                {t("aiSpotlight.email.label")}
              </span>
            </div>
            <div className="mt-4 space-y-1.5 text-sm">
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">
                  {t("aiSpotlight.email.fromLabel")}
                </span>{" "}
                {t("aiSpotlight.email.fromValue")}
              </p>
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">
                  {t("aiSpotlight.email.subjectLabel")}
                </span>{" "}
                {t("aiSpotlight.email.subjectValue")}
              </p>
            </div>
            <p className="mt-4 text-sm italic leading-relaxed text-foreground/80">
              “{t("aiSpotlight.email.body")}”
            </p>
          </article>

          {/* AI Agent card */}
          <div className="relative flex">
            <article className="relative w-full overflow-hidden rounded-2xl border border-gold-400/50 bg-gradient-to-br from-gold-100/70 via-card to-card p-6 shadow-md md:p-7">
              <motion.div
                aria-hidden
                animate={{ opacity: [0.35, 0.7, 0.35] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-gold-400/20 via-transparent to-gold-400/10"
              />
              <div className="relative">
                <div className="flex items-center justify-between border-b border-gold-400/30 pb-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gold-800">
                    <motion.span
                      animate={{ scale: [1, 1.15, 1] }}
                      transition={{
                        duration: 1.6,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className="inline-flex"
                    >
                      <Sparkles className="h-4 w-4" />
                    </motion.span>
                    {t("aiSpotlight.agent.label")}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-gold-800/80">
                    <span className="relative flex h-2 w-2">
                      <motion.span
                        animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
                        transition={{
                          duration: 1.4,
                          repeat: Infinity,
                          ease: "easeOut",
                        }}
                        className="absolute inline-flex h-full w-full rounded-full bg-gold-400"
                      />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-400" />
                    </span>
                    {t("aiSpotlight.agent.status")}
                  </span>
                </div>
                <ul className="mt-4 space-y-3">
                  {(["step1", "step2", "step3"] as const).map((key, i) => (
                    <motion.li
                      key={key}
                      initial={{ opacity: 0, x: -8 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: 0.3 + i * 0.25 }}
                      className="flex items-start gap-2.5 text-sm text-foreground"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-gold-400" />
                      <span className="leading-snug">
                        {t(`aiSpotlight.agent.${key}`)}
                      </span>
                    </motion.li>
                  ))}
                </ul>
              </div>
            </article>
          </div>

          {/* Booking mockup */}
          <article className="relative rounded-2xl border border-border/60 bg-card p-6 shadow-sm md:p-7">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-gold-800">
                <Calendar className="h-4 w-4" />
                {t("aiSpotlight.booking.label")}
              </span>
              <span className="rounded-full bg-gold-100 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gold-800">
                {t("aiSpotlight.booking.status")}
              </span>
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
          </article>
        </motion.div>

        {/* Bullets */}
        <motion.ul
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mx-auto mt-16 grid max-w-4xl gap-4 md:grid-cols-3"
        >
          {(["extract", "create", "validate"] as const).map((key) => (
            <li
              key={key}
              className="flex items-start gap-3 rounded-xl border border-border/40 bg-card/50 p-4"
            >
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-gold-400" />
              <span className="text-sm leading-relaxed text-foreground">
                {t(`aiSpotlight.bullets.${key}`)}
              </span>
            </li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
};
