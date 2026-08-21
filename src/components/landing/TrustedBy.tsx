import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";

const VENUES: { key: string; stars?: number }[] = [
  { key: "eia" },
  { key: "hana", stars: 5 },
  { key: "george", stars: 5 },
  { key: "buci", stars: 4 },
  { key: "barbizon", stars: 4 },
  { key: "capAntibes", stars: 5 },
];

export const TrustedBy = () => {
  const { t } = useTranslation("landing");

  return (
    <section
      aria-label={t("trustedBy.tagline")}
      className="border-b border-border/40 bg-background py-12 md:py-16"
    >
      <div className="container mx-auto px-4 md:px-6">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="text-center text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground md:text-sm"
        >
          {t("trustedBy.tagline")}
        </motion.p>

        <motion.ul
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mt-10 grid grid-cols-2 items-start gap-x-4 gap-y-8 sm:grid-cols-3 md:mt-12 lg:grid-cols-6 lg:gap-x-3"
        >
          {VENUES.map((venue) => (
            <li
              key={venue.key}
              className="flex min-h-[68px] flex-col items-center justify-start gap-2 text-center"
            >
              <span className="font-serif text-base leading-tight tracking-tight text-foreground md:text-lg">
                {t(`trustedBy.venues.${venue.key}.name`)}
              </span>
              <span className="flex flex-wrap items-baseline justify-center gap-x-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground md:text-[10px]">
                <span>{t(`trustedBy.venues.${venue.key}.kind`)}</span>
                {venue.stars ? (
                  <span
                    aria-label={t("trustedBy.starsLabel", {
                      count: venue.stars,
                    })}
                    className="text-[9px] tracking-tight md:text-[10px]"
                  >
                    {"★".repeat(venue.stars)}
                  </span>
                ) : null}
                <span className="whitespace-nowrap">
                  <span aria-hidden="true">· </span>
                  {t(`trustedBy.venues.${venue.key}.area`)}
                </span>
              </span>
            </li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
};
