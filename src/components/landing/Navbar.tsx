import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BRAND_DEMO_CTA, BRAND_NAME } from "./constants";
import { Wordmark } from "./Wordmark";
import { ProductMenu } from "./ProductMenu";
import { ResourcesMenu } from "./ResourcesMenu";
import { RESOURCES_MENU_ITEMS } from "./resourcesMenuItems";
import { PRODUCT_MENU_ITEMS } from "./productMenuItems";

export const Navbar = () => {
  const { t, i18n } = useTranslation("landing");
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // `html, body { height: 100% }` (index.css) fait de <body> le conteneur de
    // scroll : window.scrollY reste à 0 et l'évènement n'atteint jamais window.
    // On écoute donc les deux, selon ce qui scrolle réellement.
    const onScroll = () => {
      const y =
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0;
      setScrolled(y > 4);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.body.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.body.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // "Produit" est rendu à part : c'est un menu, pas un lien.
  const links = [
    { href: "/clients", label: t("nav.customers") },
    { href: "/tarifs", label: t("nav.pricing") },
  ];

  const switchLang = () => {
    i18n.changeLanguage(i18n.language.startsWith("fr") ? "en" : "fr");
  };

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,border-color] duration-300",
        // Menu mobile ouvert : fond plein, la liste doit rester lisible.
        mobileOpen && "border-b border-border/60 bg-background shadow-sm",
        // Au scroll : voile translucide + flou. Le repli sans backdrop-filter
        // reste assez opaque pour que le contenu ne transparaisse pas.
        !mobileOpen &&
          scrolled &&
          "border-b border-border/60 bg-background/90 shadow-sm backdrop-blur-xl supports-[backdrop-filter]:bg-background/70",
        !mobileOpen && !scrolled && "border-b border-transparent bg-transparent",
      )}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:h-20 md:px-6">
        {/* Le logo ramène à l'accueil : en ancre `#top` il ne menait nulle part
            depuis les autres pages du site. */}
        <Link
          to="/"
          className="flex items-center gap-2"
          aria-label={BRAND_NAME}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          <ProductMenu label={t("nav.product.label")} />
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[15px] font-medium text-foreground/80 transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
          <ResourcesMenu label={t("nav.resources.label")} />
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <button
            onClick={switchLang}
            className="text-xs font-medium uppercase tracking-wider text-foreground/60 transition-colors hover:text-foreground"
            aria-label="Change language"
          >
            {i18n.language.startsWith("fr") ? "EN" : "FR"}
          </button>
          <a
            href="/login"
            className="text-[15px] font-medium text-foreground/80 transition-colors hover:text-foreground"
          >
            {t("nav.login")}
          </a>
          <Button asChild size="default" className="bg-foreground text-background hover:bg-foreground/90">
            <a href={BRAND_DEMO_CTA}>{t("nav.cta")}</a>
          </Button>
        </div>

        <button
          className="flex h-10 w-10 items-center justify-center rounded-lg text-foreground md:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border/60 bg-background md:hidden"
          >
            <div className="container mx-auto flex flex-col gap-1 px-4 py-4">
              {/* Sur mobile, pas de survol : les entrées Produit sont dépliées
                  sous un intertitre plutôt que cachées derrière un menu. */}
              <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("nav.product.label")}
              </p>
              {PRODUCT_MENU_ITEMS.map((item) => (
                <a
                  key={item.key}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium text-foreground/80 hover:bg-muted"
                >
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold-100 text-gold-700"
                  >
                    <item.icon className="h-4 w-4" />
                  </span>
                  {t(`nav.product.items.${item.key}.title`)}
                </a>
              ))}

              <div className="my-2 border-t border-border/60" />

              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-3 text-base font-medium text-foreground/80 hover:bg-muted"
                >
                  {link.label}
                </a>
              ))}
              <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("nav.resources.label")}
              </p>
              {RESOURCES_MENU_ITEMS.map((item) => (
                <a
                  key={item.key}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  {...(item.external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium text-foreground/80 hover:bg-muted"
                >
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold-100 text-gold-700"
                  >
                    <item.icon className="h-4 w-4" />
                  </span>
                  {t(`nav.resources.items.${item.key}.title`)}
                </a>
              ))}

              <div className="my-2 border-t border-border/60" />

              <a
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-3 text-base font-medium text-foreground/80 hover:bg-muted"
              >
                {t("nav.login")}
              </a>
              <button
                onClick={() => {
                  switchLang();
                  setMobileOpen(false);
                }}
                className="rounded-lg px-3 py-3 text-left text-base font-medium text-foreground/60 hover:bg-muted"
              >
                {i18n.language.startsWith("fr") ? "English" : "Français"}
              </button>
              <Button asChild size="lg" className="mt-2 bg-foreground text-background hover:bg-foreground/90">
                <a href={BRAND_DEMO_CTA} onClick={() => setMobileOpen(false)}>
                  {t("nav.cta")}
                </a>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
