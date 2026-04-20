import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { brandLogos } from "@/config/brand";
import { cn } from "@/lib/utils";

const DEMO_CTA = "mailto:hello@lymfea.fr?subject=Demo%20Ei%CC%88a";

export const Navbar = () => {
  const { t, i18n } = useTranslation("landing");
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const links = [
    { href: "#features", label: t("nav.features") },
    { href: "#how-it-works", label: t("nav.howItWorks") },
  ];

  const switchLang = () => {
    i18n.changeLanguage(i18n.language.startsWith("fr") ? "en" : "fr");
  };

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled
          ? "border-b border-border/60 bg-background/85 backdrop-blur-xl"
          : "bg-transparent",
      )}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:h-20 md:px-6">
        <a href="#top" className="flex items-center gap-2">
          <img src={brandLogos.primary} alt="Eïa" className="h-7 md:h-8" />
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-foreground/80 transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
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
            className="text-sm font-medium text-foreground/80 transition-colors hover:text-foreground"
          >
            {t("nav.login")}
          </a>
          <Button asChild size="default" className="bg-foreground text-background hover:bg-foreground/90">
            <a href={DEMO_CTA}>{t("nav.cta")}</a>
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
                <a href={DEMO_CTA} onClick={() => setMobileOpen(false)}>
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
