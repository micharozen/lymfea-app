/**
 * Les établissements dont une étude de cas est prévue.
 *
 * Nom, type et ville viennent des clés `trustedBy.venues.*` déjà traduites :
 * le mur de logos et les études de cas ne doivent pas diverger. `status` vaut
 * "soon" tant que l'établissement n'a pas relu et validé son témoignage ; la
 * page affiche alors un gabarit d'attente au lieu d'une citation inventée.
 */
export interface CustomerStory {
  /** Clé i18n sous `trustedBy.venues` et `customers.stories`. */
  key: "buci" | "capAntibes" | "hana";
  slug: string;
  logo: string;
  /** Taille du logo dans une carte : les originaux n'ont pas le même gabarit. */
  logoClass: string;
  href: string;
  status: "soon" | "published";
}

export const CUSTOMER_STORIES: CustomerStory[] = [
  {
    key: "buci",
    slug: "hotel-de-buci",
    logo: "/images/logos/buci.svg",
    logoClass: "h-12 max-w-[130px]",
    href: "https://www.buci-hotel.com",
    status: "soon",
  },
  {
    key: "capAntibes",
    slug: "cap-antibes-beach-hotel",
    logo: "/images/logos/capantibes.png",
    logoClass: "h-6 max-w-[210px]",
    href: "https://capdantibes-beachhotel.com",
    status: "soon",
  },
  {
    key: "hana",
    slug: "hotel-hana",
    logo: "/images/logos/hana.svg",
    logoClass: "h-7 max-w-[170px]",
    href: "https://hotelhana-paris.com",
    status: "soon",
  },
];

export const findCustomerStory = (slug: string | undefined): CustomerStory | undefined =>
  CUSTOMER_STORIES.find((story) => story.slug === slug);
