import { Code2, HelpCircle, Megaphone } from "lucide-react";
import { BRAND_DOCS_URL } from "./constants";

/**
 * Les entrées du menu Ressources.
 *
 * `external` distingue la documentation, hébergée sur son propre domaine, du
 * journal des versions qui vit dans le site.
 */
export const RESOURCES_MENU_ITEMS = [
  { key: "apiDocs", icon: Code2, href: BRAND_DOCS_URL, external: true },
  { key: "changelog", icon: Megaphone, href: "/changelog", external: false },
  { key: "faq", icon: HelpCircle, href: "/#faq", external: false },
] as const;
