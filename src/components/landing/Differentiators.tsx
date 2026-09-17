import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Mail, Wallet } from "lucide-react";

const EASE = [0.16, 1, 0.3, 1] as const;
const ROTATION_MS = 4200;

// Établissements réels. Couleurs de bouton et polices proviennent de
// `venue_branding` en production ; les slugs sont ceux de `hotels.slug`.
// `cover` : photo fournie par l'établissement, sinon le logo se détache sur
// la couleur de marque.
const VENUES = [
  {
    key: "george",
    name: "Hôtel Monsieur George",
    slug: "hotel-monsieur-george",
    accent: "#253915",
    ctaTextColor: "#FFFFFF",
    logo: "/images/logos/george.png",
    logoClass: "h-7 md:h-8",
    nameClass: "font-serif text-lg md:text-xl",
    cover: "/images/landing/venue-monsieur-george.jpg",
  },
  {
    key: "capAntibes",
    name: "Cap d'Antibes Beach Hôtel",
    slug: "cabh-eiaspa",
    accent: "#e39f88",
    ctaTextColor: "#F5F5F5",
    logo: "/images/logos/capantibes.png",
    logoClass: "h-3 md:h-4",
    // Eurostile Extended côté client : à défaut de la fonte, on en garde la
    // signature élargie plutôt que d'afficher une police qui n'est pas la leur.
    nameClass: "font-grotesk text-xs font-medium uppercase tracking-[0.3em] md:text-sm",
    cover: "/images/landing/venue-cap-antibes.jpg",
  },
] as const;

const LINK_BULLETS = ["address", "brand", "emails", "qr"] as const;
const CART_STEPS = ["left", "first", "second", "paid"] as const;

export const Differentiators = () => {
  const { t } = useTranslation("landing");
  const reduce = useReducedMotion();

  return (
    <section id="differentiators" className="py-24 md:py-32">
      <div className="container mx-auto px-4 md:px-6">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="max-w-2xl"
        >
          <h2 className="pb-1 font-serif text-3xl leading-[1.1] tracking-tight text-foreground md:text-5xl">
            {t("differentiators.title")}{" "}
            <span className="italic text-primary">{t("differentiators.titleHighlight")}</span>
            <span className="text-primary">.</span>
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            {t("differentiators.subtitle")}
          </p>
        </motion.div>

        <div className="mt-14 grid gap-4">
          <BookingLinkCard />
          <div className="grid gap-4 md:grid-cols-5">
            <InboxAgentCard />
            <AbandonedCartCard />
          </div>
        </div>
      </div>
    </section>
  );
};

/* ── 01. Le lien de réservation personnalisé ──────────────────────────────── */

const BookingLinkCard = () => {
  const { t } = useTranslation("landing");
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const [index, setIndex] = useState(0);

  // La rotation ne tourne qu'à l'écran : c'est elle qui raconte
  // « une adresse et une page par lieu », pas une boucle décorative.
  useEffect(() => {
    if (reduce || !inView) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % VENUES.length), ROTATION_MS);
    return () => window.clearInterval(id);
  }, [reduce, inView]);

  const venue = VENUES[index];

  return (
    <motion.article
      ref={ref}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 md:p-10"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-gold-100/60 via-transparent to-transparent" />

      <div className="relative grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-5">
          <h3 className="font-serif text-2xl leading-tight text-foreground md:text-3xl">
            {t("differentiators.link.title")}
          </h3>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">
            {t("differentiators.link.desc")}
          </p>
          <ul className="mt-6 space-y-2.5">
            {LINK_BULLETS.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
                <span aria-hidden className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-gold-500" />
                {t(`differentiators.link.bullets.${bullet}`)}
              </li>
            ))}
          </ul>
        </div>

        {/* Aperçu animé : la page de réservation du lieu, telle qu'un client la reçoit. */}
        <div aria-hidden className="flex justify-center lg:col-span-7">
          <div className="relative w-[248px] rounded-[2.75rem] bg-zinc-900 p-2.5 shadow-[0_28px_60px_-20px_rgba(0,0,0,0.45)] md:w-[276px]">
            <div className="relative aspect-[9/19] overflow-hidden rounded-[2.1rem] bg-background">
              {/* Îlot dynamique */}
              <span className="absolute left-1/2 top-2.5 z-20 h-5 w-20 -translate-x-1/2 rounded-full bg-zinc-900" />

              {/* Couverture du lieu */}
              <div className="relative h-[58%] overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={venue.key}
                    initial={reduce ? false : { opacity: 0, scale: 1.05 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reduce ? undefined : { opacity: 0 }}
                    transition={{ duration: 0.7, ease: EASE }}
                    style={{ backgroundColor: venue.accent }}
                    className="absolute inset-0"
                  >
                    {venue.cover ? (
                      <img src={venue.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <span
                        className="absolute inset-0"
                        style={{
                          backgroundImage:
                            "radial-gradient(120% 90% at 15% 0%, rgba(255,255,255,0.22), transparent 60%)",
                        }}
                      />
                    )}
                    <span
                      className="absolute inset-0"
                      style={{
                        backgroundImage: `linear-gradient(to top, ${venue.accent} 2%, ${venue.accent}99 26%, transparent 62%)`,
                      }}
                    />
                  </motion.div>
                </AnimatePresence>

                <div className="absolute inset-x-0 bottom-0 p-4">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={venue.key}
                      initial={reduce ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduce ? undefined : { opacity: 0, y: -8 }}
                      transition={{ duration: 0.45, ease: EASE }}
                    >
                      <img
                        src={venue.logo}
                        alt=""
                        loading="lazy"
                        className={`w-auto max-w-[150px] object-contain brightness-0 invert ${venue.logoClass}`}
                      />
                      <p className={`mt-2 truncate text-white/80 ${venue.nameClass}`}>
                        {t(`trustedBy.venues.${venue.key}.area`)}
                      </p>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              {/* Choix du soin et bouton de réservation */}
              <div className="flex h-[42%] flex-col justify-between px-4 pb-4 pt-4">
                <div className="space-y-2.5">
                  {(["signature", "duo", "facial"] as const).map((treatment, i) => (
                    <div
                      key={treatment}
                      className={`flex items-center justify-between border-b border-border/60 pb-2.5 ${
                        i > 0 ? "opacity-55" : ""
                      }`}
                    >
                      <span className="truncate pr-3 text-[11px] text-foreground">
                        {t(`differentiators.link.treatments.${treatment}.name`)}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {t(`differentiators.link.treatments.${treatment}.price`)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <span
                    style={{ backgroundColor: venue.accent, color: venue.ctaTextColor }}
                    className="flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-[11px] font-medium transition-colors duration-500"
                  >
                    {t("differentiators.link.cta")}
                    <ArrowRight className="h-3 w-3" />
                  </span>

                  {/* Barre d'adresse : le lien change avec le lieu */}
                  <p className="flex min-w-0 items-baseline justify-center rounded-lg bg-muted/60 px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
                    <span className="shrink-0">saoma.io/</span>
                    <AnimatedSlug slug={venue.slug} animate={!reduce} />
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.article>
  );
};

const AnimatedSlug = ({ slug, animate }: { slug: string; animate: boolean }) => (
  <span className="truncate text-foreground">
    <AnimatePresence mode="wait">
      <motion.span key={slug} className="inline-flex">
        {slug.split("").map((char, i) => (
          <motion.span
            key={`${slug}-${i}`}
            initial={animate ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.12, delay: i * 0.028, ease: "linear" }}
          >
            {char}
          </motion.span>
        ))}
      </motion.span>
    </AnimatePresence>
  </span>
);

/* ── 02. L'agent IA sur les demandes entrantes ────────────────────────────── */

const InboxAgentCard = () => {
  const { t } = useTranslation("landing");
  const reduce = useReducedMotion();

  const reveal = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 8 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.4 },
    transition: { duration: 0.45, delay, ease: EASE },
  });

  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="rounded-2xl border border-border/60 bg-card p-6 md:col-span-3 md:p-8"
    >
      <h3 className="font-serif text-2xl leading-tight text-foreground md:text-3xl">
        {t("differentiators.agent.title")}
      </h3>
      <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground md:text-base">
        {t("differentiators.agent.desc")}
      </p>

      <div aria-hidden className="mt-7 space-y-3">
        {/* La demande telle qu'elle arrive */}
        <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Mail className="h-4 w-4 text-gold-600" />
            <span className="truncate font-mono">{t("differentiators.agent.inbox")}</span>
          </div>
          <p className="mt-2.5 text-sm italic leading-relaxed text-foreground/80">
            “{t("differentiators.agent.quote")}”
          </p>
        </div>

        {/* Ce que l'agent en fait, en une ligne */}
        <motion.p
          {...reveal(0.15)}
          className="px-1 text-xs leading-relaxed text-muted-foreground"
        >
          {t("differentiators.agent.processing")}
        </motion.p>

        {/* La finalité : la réservation créée et la réponse partie */}
        <motion.div
          {...reveal(0.35)}
          className="overflow-hidden rounded-xl border border-gold-500/40 bg-gold-100/60"
        >
          <p className="border-b border-gold-500/25 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-gold-800">
            {t("differentiators.agent.created")}
          </p>
          <div className="space-y-1.5 px-4 py-3.5">
            <p className="font-serif text-lg text-foreground">
              {t("differentiators.agent.booking.treatment")}
            </p>
            {(["slot", "guests", "room"] as const).map((line) => (
              <p key={line} className="text-xs text-muted-foreground">
                {t(`differentiators.agent.booking.${line}`)}
              </p>
            ))}
          </div>
          <p className="flex items-start gap-2 border-t border-gold-500/25 px-4 py-3 text-xs leading-snug text-gold-800">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("differentiators.agent.replied")}
          </p>
        </motion.div>
      </div>
    </motion.article>
  );
};

/* ── 03. La relance des paniers abandonnés ────────────────────────────────── */

const AbandonedCartCard = () => {
  const { t } = useTranslation("landing");
  const reduce = useReducedMotion();

  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
      className="rounded-2xl border border-border/60 bg-gold-100/50 p-6 md:col-span-2 md:p-8"
    >
      <h3 className="font-serif text-2xl leading-tight text-foreground md:text-3xl">
        {t("differentiators.cart.title")}
      </h3>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">
        {t("differentiators.cart.desc")}
      </p>

      <ol aria-hidden className="relative mt-7 pl-6">
        <motion.span
          initial={reduce ? false : { scaleY: 0 }}
          whileInView={{ scaleY: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 1, ease: EASE }}
          className="absolute left-[3px] top-2 h-[calc(100%-1rem)] w-px origin-top bg-gold-500/50"
        />
        {CART_STEPS.map((step, i) => {
          const isLast = i === CART_STEPS.length - 1;
          return (
            <motion.li
              key={step}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.45, delay: 0.2 + i * 0.22, ease: EASE }}
              className="relative pb-6 last:pb-0"
            >
              <span
                className={`absolute -left-6 top-1.5 h-[7px] w-[7px] rounded-full ${
                  isLast ? "bg-gold-700" : "bg-gold-500"
                }`}
              />
              <p className={`text-sm leading-snug ${isLast ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                {t(`differentiators.cart.steps.${step}`)}
              </p>
            </motion.li>
          );
        })}
      </ol>

      <p className="mt-6 flex items-center gap-2 border-t border-gold-500/25 pt-5 text-xs text-muted-foreground">
        <Wallet className="h-4 w-4 shrink-0 text-gold-600" />
        {t("differentiators.cart.note")}
      </p>
    </motion.article>
  );
};
