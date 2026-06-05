import { useTranslation } from "react-i18next";
import { BRAND_DEMO_CTA, BRAND_EMAIL } from "./constants";
import { Wordmark } from "./Wordmark";


export const Footer = () => {
  const { t } = useTranslation("landing");
  const year = new Date().getFullYear();

  const columns = [
    {
      title: t("footer.product"),
      links: [
        { label: t("footer.links.features"), href: "/#features" },
        { label: t("footer.links.howItWorks"), href: "/#how-it-works" },
        { label: t("footer.links.pricing"), href: "/#pricing" },
        { label: t("footer.links.demo"), href: BRAND_DEMO_CTA },
        { label: t("footer.links.login"), href: "/login" },
      ],
    },
    {
      title: t("footer.company"),
      links: [
        { label: t("footer.links.email"), href: `mailto:${BRAND_EMAIL}` },
        { label: t("footer.links.contact"), href: BRAND_DEMO_CTA },
        { label: t("footer.links.status"), href: "https://status.saoma.io/" },
      ],
    },
    {
      title: t("footer.legal"),
      links: [
        { label: t("footer.links.terms"), href: "/terms" },
        { label: t("footer.links.privacy"), href: "/privacy" },
        { label: t("footer.links.legalMentions"), href: "#" },
      ],
    },
  ];

  return (
    <footer className="border-t border-border/60 bg-foreground text-background">
      <div className="container mx-auto px-4 py-16 md:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Wordmark variant="inverted" className="text-3xl md:text-4xl" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-background/70">
              {t("footer.tagline")}
            </p>
            <p className="mt-4 text-xs text-background/50">{BRAND_EMAIL}</p>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <div className="text-xs font-medium uppercase tracking-[0.15em] text-background/60">
                {col.title}
              </div>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => {
                  const isExternal = /^https?:\/\//.test(link.href);
                  return (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-background/80 transition-colors hover:text-background"
                        {...(isExternal
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                      >
                        {link.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-3 border-t border-background/10 pt-6 text-xs text-background/60 md:flex-row md:items-center">
          <span>{t("footer.copyright", { year })}</span>
          <span className="font-serif italic text-background/70">{t("footer.signature")}</span>
        </div>
      </div>
    </footer>
  );
};
