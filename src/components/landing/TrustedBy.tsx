import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";

type VenueStyle = "serif" | "serifItalic" | "sansTracked" | "sansBold";

const VENUES: { key: string; style: VenueStyle }[] = [
  { key: "eia", style: "sansBold" },
  { key: "hanna", style: "serifItalic" },
  { key: "george", style: "serif" },
  { key: "soho", style: "sansTracked" },
  { key: "buci", style: "serifItalic" },
  { key: "holy", style: "sansBold" },
  { key: "capAntibes", style: "serif" },
];

const STYLE_CLASSES: Record<VenueStyle, string> = {
  serif: "font-serif text-base md:text-lg tracking-tight",
  serifItalic: "font-serif italic text-base md:text-lg tracking-tight",
  sansTracked:
    "font-grotesk text-xs md:text-sm font-medium tracking-[0.18em] uppercase",
  sansBold:
    "font-grotesk text-xs md:text-sm font-semibold tracking-[0.12em] uppercase",
};

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
          className="mt-10 grid grid-cols-2 items-center gap-x-4 gap-y-8 sm:grid-cols-3 md:mt-12 md:grid-cols-4 lg:grid-cols-7 lg:gap-x-3"
        >
          {VENUES.map((venue) => (
            <li
              key={venue.key}
              className="flex min-h-[68px] flex-col items-center justify-center text-center"
            >
              <span
                className={`${STYLE_CLASSES[venue.style]} leading-tight text-foreground`}
              >
                {t(`trustedBy.venues.${venue.key}.name`)}
              </span>
              <span className="mt-2 whitespace-nowrap text-[10px] uppercase tracking-wider text-muted-foreground md:text-[11px]">
                {t(`trustedBy.venues.${venue.key}.address`)}
              </span>
            </li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
};
