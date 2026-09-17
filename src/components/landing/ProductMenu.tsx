import { useTranslation } from "react-i18next";
import { ArrowRight, Sparkles } from "lucide-react";
import { NavDropdown } from "./NavDropdown";
import { PRODUCT_MENU_GROUPS } from "./productMenuItems";

/**
 * Le menu Produit : deux colonnes d'entrées et une carte de mise en avant.
 */
export const ProductMenu = ({ label }: { label: string }) => {
  const { t } = useTranslation("landing");

  return (
    <NavDropdown label={label} panelClassName="w-[min(940px,calc(100vw-3rem))]">
      {(close) => (
        <div className="grid overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_30px_80px_-40px_rgba(80,60,30,0.45)] lg:grid-cols-[1.25fr_1fr]">
          <div className="grid gap-8 p-6 sm:grid-cols-2 md:p-8">
            {PRODUCT_MENU_GROUPS.map((group) => (
              <div key={group.key}>
                <p className="border-b border-border/60 pb-3 font-serif text-lg text-foreground">
                  {t(`nav.product.groups.${group.key}`)}
                </p>
                <ul className="mt-4 space-y-1">
                  {group.items.map((item) => (
                    <li key={item.key}>
                      <a
                        href={item.href}
                        onClick={close}
                        className="group flex items-start gap-3 rounded-xl p-2.5 transition-colors hover:bg-gold-100/50"
                      >
                        <span
                          aria-hidden
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-100 text-gold-700 transition-colors group-hover:bg-gold-200"
                        >
                          <item.icon className="h-[18px] w-[18px]" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground">
                            {t(`nav.product.items.${item.key}.title`)}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                            {t(`nav.product.items.${item.key}.desc`)}
                          </span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* La carte de droite met en avant ce qui distingue le produit,
              avec la capture de l'écran réel plutôt qu'une illustration. */}
          <a
            href="/#differentiators"
            onClick={close}
            className="group relative isolate hidden overflow-hidden bg-gradient-to-br from-gold-200 via-gold-100 to-gold-50 p-8 lg:block"
          >
            <span className="relative z-20 block max-w-[230px]">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles aria-hidden className="h-[18px] w-[18px]" />
              </span>
              <span className="mt-4 block font-serif text-2xl leading-tight text-foreground">
                {t("nav.product.highlight.title")}
              </span>
              <span className="mt-2 block text-sm leading-relaxed text-foreground/70">
                {t("nav.product.highlight.desc")}
              </span>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                {t("nav.product.highlight.cta")}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </span>

            <img
              src="/images/landing/app-inbox-agent.webp"
              alt=""
              aria-hidden
              loading="lazy"
              className="pointer-events-none absolute -bottom-20 -right-16 z-0 w-[340px] max-w-none rounded-xl border border-border/50 opacity-90 shadow-[0_24px_50px_-28px_rgba(80,60,30,0.5)]"
            />
          </a>
        </div>
      )}
    </NavDropdown>
  );
};
