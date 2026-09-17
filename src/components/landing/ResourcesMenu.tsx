import { useTranslation } from "react-i18next";
import { NavDropdown } from "./NavDropdown";
import { RESOURCES_MENU_ITEMS } from "./resourcesMenuItems";

/**
 * Le menu Ressources.
 *
 * Deux entrées pour l'instant, la documentation partenaires et le journal des
 * versions. Le menu reste volontairement compact : une carte de mise en avant
 * comme celle du menu Produit serait disproportionnée pour deux liens.
 */
export const ResourcesMenu = ({ label }: { label: string }) => {
  const { t } = useTranslation("landing");

  return (
    <NavDropdown label={label} panelClassName="w-[340px]">
      {(close) => (
        <ul className="overflow-hidden rounded-2xl border border-border/60 bg-card p-2 shadow-[0_30px_80px_-40px_rgba(80,60,30,0.45)]">
          {RESOURCES_MENU_ITEMS.map((item) => (
            <li key={item.key}>
              <a
                href={item.href}
                onClick={close}
                {...(item.external
                  ? { target: "_blank", rel: "noreferrer noopener" }
                  : {})}
                className="group flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-gold-100/50"
              >
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-100 text-gold-700 transition-colors group-hover:bg-gold-200"
                >
                  <item.icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">
                    {t(`nav.resources.items.${item.key}.title`)}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {t(`nav.resources.items.${item.key}.desc`)}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </NavDropdown>
  );
};
