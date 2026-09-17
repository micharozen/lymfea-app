import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { ArrowRight, Plus } from "lucide-react";
import { PhoneFrame } from "./PhoneFrame";

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

/**
 * Les trois mécaniques, chacune avec son aperçu. `previewClass` fixe la largeur
 * à laquelle la capture est posée dans le cadre : elle dépasse volontairement
 * celle du cadre, qui la rogne à droite. L'écran garde ainsi une échelle
 * lisible au lieu d'être réduit jusqu'à ce qu'on n'y distingue plus rien.
 */
const FEATURES = [
  { key: "link", preview: "phone" },
  // Les deux captures sont cadrées à 900 px dans l'app : elles occupent la
  // largeur du cadre et ne débordent que par le bas, donc rien d'essentiel
  // n'est coupé. `align` reste le bord auquel la capture est accrochée.
  // Cette capture est déjà compacte : la rogner sur un côté couperait soit le
  // message reçu, soit l'analyse. Elle occupe la largeur du cadre et déborde
  // seulement par le bas.
  { key: "agent", preview: "/images/landing/app-inbox-agent.webp", previewClass: "w-full", align: "left" },
  { key: "cart", preview: "/images/landing/app-checkout-intents.webp", previewClass: "w-full", align: "left" },
] as const;

type Feature = (typeof FEATURES)[number];
type FeatureKey = Feature["key"];

export const Differentiators = () => {
  const { t } = useTranslation("landing");
  const reduce = useReducedMotion();
  const [activeKey, setActiveKey] = useState<FeatureKey>(FEATURES[0].key);
  const active = FEATURES.find((f) => f.key === activeKey) ?? FEATURES[0];

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

        <div className="mt-14 grid items-start gap-8 lg:grid-cols-12 lg:gap-12">
          <ul className="lg:col-span-5">
            {FEATURES.map((feature, i) => (
              <FeatureRow
                key={feature.key}
                featureKey={feature.key}
                index={i}
                isActive={feature.key === activeKey}
                onSelect={() => setActiveKey(feature.key)}
              />
            ))}
          </ul>

          <div className="lg:col-span-7">
            <FeaturePreview feature={active} />
          </div>
        </div>
      </div>
    </section>
  );
};

/* ── La liste, à gauche ───────────────────────────────────────────────────── */

const FeatureRow = ({
  featureKey,
  index,
  isActive,
  onSelect,
}: {
  featureKey: FeatureKey;
  index: number;
  isActive: boolean;
  onSelect: () => void;
}) => {
  const { t } = useTranslation("landing");
  const reduce = useReducedMotion();

  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, delay: index * 0.07, ease: EASE }}
      className={`border-t border-border/60 last:border-b ${isActive ? "bg-gold-100/40" : ""}`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-expanded={isActive}
        className="flex w-full items-start gap-4 px-4 py-5 text-left transition-colors hover:bg-gold-100/30 md:px-5 md:py-6"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-serif text-lg leading-snug text-foreground md:text-xl">
            {t(`differentiators.${featureKey}.title`)}
          </span>
          {/* La description n'apparaît que sur la ligne ouverte : la liste se lit
              d'un coup d'œil, le détail vient au clic. */}
          <AnimatePresence initial={false}>
            {isActive && (
              <motion.span
                initial={reduce ? false : { height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={reduce ? undefined : { height: 0, opacity: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="block overflow-hidden"
              >
                <span className="mt-2 block text-sm leading-relaxed text-muted-foreground">
                  {t(`differentiators.${featureKey}.desc`)}
                </span>
              </motion.span>
            )}
          </AnimatePresence>
        </span>

        <span
          aria-hidden
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors ${
            isActive
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border/70 text-muted-foreground"
          }`}
        >
          {isActive ? <ArrowRight className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </span>
      </button>
    </motion.li>
  );
};

/* ── L'aperçu, à droite ───────────────────────────────────────────────────── */

const FeaturePreview = ({ feature }: { feature: Feature }) => {
  const { t } = useTranslation("landing");
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6, ease: EASE }}
      // Hauteur fixe : les trois aperçus n'ont pas le même format, sans elle la
      // page sauterait à chaque changement de ligne.
      className="relative h-[480px] overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-gold-100/70 via-gold-50/40 to-background p-5 md:h-[620px] md:p-6"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={feature.key}
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -8 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="h-full"
        >
          {feature.preview === "phone" ? (
            <div className="flex h-full items-start justify-center">
              <VenuePhoneMockup />
            </div>
          ) : (
            <div className="relative h-full">
              <img
                src={feature.preview}
                alt={t(`differentiators.${feature.key}.alt`)}
                loading="lazy"
                decoding="async"
                // La capture garde sa largeur d'écran et déborde du cadre : elle
                // est rognée sur un bord plutôt que réduite jusqu'à l'illisible.
                // La largeur baisse sur mobile, sinon il ne resterait qu'un coin.
                className={`absolute top-0 h-auto max-w-none rounded-xl border border-border/50 shadow-[0_24px_50px_-28px_rgba(80,60,30,0.45)] ${feature.previewClass} ${
                  feature.align === "right" ? "right-0" : "left-0"
                }`}
              />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
};

/* ── L'aperçu du lien de réservation : la page telle qu'un client la reçoit ─ */

const VenuePhoneMockup = () => {
  const { t } = useTranslation("landing");
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
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
    <PhoneFrame ref={ref} aria-hidden>
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
            <img src={venue.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
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
    </PhoneFrame>
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
