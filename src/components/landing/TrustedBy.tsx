import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";

// Logos fournis par les établissements clients, ramenés au noir pour que le mur
// se lise comme un seul système. Chaque logo renvoie au site de l'établissement.
const VENUES = [
  { key: "hana", src: "/images/logos/hana.svg", className: "h-5 max-w-[150px] md:h-6", href: "https://hotelhana-paris.com" },
  { key: "george", src: "/images/logos/george.png", className: "h-7 max-w-[150px] md:h-8", href: "https://www.monsieurgeorge.com" },
  { key: "buci", src: "/images/logos/buci.svg", className: "h-9 max-w-[110px] md:h-10", href: "https://www.buci-hotel.com" },
  { key: "barbizon", src: "/images/logos/barbizon.png", className: "h-11 max-w-[110px] md:h-12", href: "https://www.lafoliebarbizon.com" },
  { key: "capAntibes", src: "/images/logos/capantibes.png", className: "h-5 max-w-[190px] md:h-6", href: "https://capdantibes-beachhotel.com" },
  { key: "sohoHouse", src: "/images/logos/sohohouse.svg", className: "h-3 max-w-[150px] md:h-4", href: "https://www.sohohouse.com" },
] as const;

const COPIES = [0, 1, 2, 3, 4, 5];

export const TrustedBy = () => {
  const { t } = useTranslation("landing");
  const reduce = useReducedMotion();

  return (
    <section
      aria-label={t("trustedBy.tagline")}
      className="border-b border-border/40 bg-background py-12 md:py-16"
    >
      <div className="container mx-auto px-4 md:px-6">
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="text-center text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground md:text-sm"
        >
          {t("trustedBy.tagline")}
        </motion.p>
      </div>

      {reduce ? (
        <ul className="container mx-auto mt-10 flex flex-wrap items-center justify-center gap-x-12 gap-y-8 px-4 md:mt-12 md:px-6">
          {VENUES.map((venue) => (
            <LogoItem key={venue.key} venue={venue} />
          ))}
        </ul>
      ) : (
        <div
          className="mt-10 overflow-hidden md:mt-12"
          style={{
            // Les logos s'effacent aux deux bords au lieu d'être coupés net.
            maskImage: "linear-gradient(to right, transparent, black 9%, black 91%, transparent)",
            WebkitMaskImage: "linear-gradient(to right, transparent, black 9%, black 91%, transparent)",
          }}
        >
          {/* Six copies : la translation de -50 % ramène la seconde moitié
              exactement sur la première, donc la boucle ne laisse aucun trou. */}
          <ul className="flex w-max animate-marquee items-center gap-x-16 pr-16 hover:[animation-play-state:paused] md:gap-x-24 md:pr-24">
            {COPIES.map((copy) =>
              VENUES.map((venue) => (
                <LogoItem key={`${venue.key}-${copy}`} venue={venue} duplicate={copy > 0} />
              )),
            )}
          </ul>
        </div>
      )}
    </section>
  );
};

type Venue = (typeof VENUES)[number];

// `duplicate` : copie de remplissage du défilement, retirée du DOM accessible
// pour ne pas répéter six fois les mêmes liens à un lecteur d'écran.
const LogoItem = ({ venue, duplicate = false }: { venue: Venue; duplicate?: boolean }) => {
  const { t } = useTranslation("landing");
  const name = t(`trustedBy.venues.${venue.key}.name`);

  return (
    <li className="flex shrink-0 items-center justify-center" aria-hidden={duplicate || undefined}>
      <a
        href={venue.href}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={name}
        tabIndex={duplicate ? -1 : undefined}
        className="group flex items-center justify-center"
      >
        <img
          src={venue.src}
          alt={name}
          loading="lazy"
          className={`w-auto object-contain opacity-55 brightness-0 transition-opacity duration-300 group-hover:opacity-100 ${venue.className}`}
        />
      </a>
    </li>
  );
};
