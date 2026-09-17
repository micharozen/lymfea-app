import {
  CalendarRange,
  DoorOpen,
  Link2,
  Smartphone,
  Sparkles,
  ShoppingCart,
} from "lucide-react";

/**
 * Les entrées du menu Produit.
 *
 * Chaque entrée renvoie vers la section correspondante de la page d'accueil :
 * il n'existe pas encore de page dédiée par fonctionnalité. Tant que c'est le
 * cas, on n'aligne que des entrées qui mènent réellement quelque part.
 */
export const PRODUCT_MENU_GROUPS = [
  {
    key: "run",
    items: [
      { key: "agenda", icon: CalendarRange, href: "/#features" },
      { key: "therapistApp", icon: Smartphone, href: "/#features" },
      { key: "rooms", icon: DoorOpen, href: "/#features" },
    ],
  },
  {
    key: "fill",
    items: [
      { key: "bookingLink", icon: Link2, href: "/#differentiators" },
      { key: "agent", icon: Sparkles, href: "/#differentiators" },
      { key: "cart", icon: ShoppingCart, href: "/#differentiators" },
    ],
  },
] as const;

/** Liste plate des entrées, pour le menu mobile qui n'affiche pas les groupes. */
export const PRODUCT_MENU_ITEMS = PRODUCT_MENU_GROUPS.flatMap((group) => [...group.items]);
