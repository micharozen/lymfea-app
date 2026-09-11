// Comparison data for the public "Saoma vs ..." marketing pages.
//
// IMPORTANT — fairness & legal: competitor capabilities below reflect publicly
// available information and are intentionally neutral. Comparative advertising
// must stay objective and verifiable, so every `no` / `partial` cell must be
// defensible from the `sources` listed on each competitor. When in doubt, state
// what Saoma does rather than asserting an absence on the other side.
//
// Re-verify quarterly and keep `DATA_AS_OF` current — this market moves fast
// (Book4Time was acquired by Agilysys, Fresha dropped its free plan).
// The disclaimer shown on-page references this date.

export const DATA_AS_OF = "2026-09";

/** A single feature-matrix cell value. `soon` = on the roadmap / coming soon. */
export type Cell = "yes" | "partial" | "no" | "soon";

/**
 * Comparison dimensions, ordered for display. Each key maps to a label in the
 * `compare` i18n namespace (`dimensions.<key>`).
 *
 * Ordering rule: the rows where Saoma is genuinely alone come first. Hotel PMS
 * integration is no longer a differentiator against the spa specialists (most
 * of them connect to Opera and/or Mews), so it now sits in the middle as a
 * prerequisite rather than as an argument.
 */
export const DIMENSION_KEYS = [
  "emailToBookingAi",
  "transparentPricing",
  "multilingual",
  "euCompliance",
  "therapistApp",
  "clientBooking",
  "pmsHotel",
  "unifiedAgenda",
  "payments",
  "giftCards",
  "autoInvoicing",
  "notifications",
  "apiAccess",
  "staycationIntegration",
] as const;

export type DimensionKey = (typeof DIMENSION_KEYS)[number];

/**
 * Saoma's own column. Kept strictly aligned with what is actually shipped: only
 * claim a `yes` when the feature exists in the product today, not on the
 * roadmap (that is what `soon` is for).
 */
export const SAOMA_MATRIX: Record<DimensionKey, Cell> = {
  emailToBookingAi: "yes",
  transparentPricing: "yes",
  multilingual: "yes",
  euCompliance: "yes",
  therapistApp: "yes",
  clientBooking: "yes",
  pmsHotel: "yes",
  unifiedAgenda: "yes",
  payments: "yes",
  giftCards: "yes",
  autoInvoicing: "yes",
  notifications: "yes",
  apiAccess: "yes",
  staycationIntegration: "soon",
};

export interface CompetitorContent {
  /** One-line neutral positioning of the competitor. */
  tagline: string;
  /** Who the competitor is typically the best fit for. */
  bestFor: string;
  /** 2–3 sentence neutral overview + how Saoma differs. */
  summary: string;
  /** Why a hotel spa would choose Saoma over this tool. */
  saomaAdvantages: string[];
  /** Fair counterpoint: where the competitor is strong / when to pick it. */
  competitorStrengths: string[];
  /** Long-tail FAQ targeting search intent ("Saoma vs X", "X alternative", ...). */
  faq: { q: string; a: string }[];
}

/** Public source backing the matrix cells for one competitor. */
export interface CompetitorSource {
  label: string;
  url: string;
  /** ISO date the URL was last checked (YYYY-MM-DD). */
  checkedAt: string;
}

export interface Competitor {
  /** URL segment: /compare/saoma-vs-<slug> */
  slug: string;
  /** Display name. */
  name: string;
  /** Grouping label key in i18n: compare.categories.<category> */
  category: "spaHotel" | "spaWellness" | "marketplace";
  /** Neutral factual origin, shown as a small meta. */
  origin: string;
  matrix: Record<DimensionKey, Cell>;
  /** Public sources justifying the cells above. Reviewed quarterly. */
  sources: CompetitorSource[];
  fr: CompetitorContent;
  en: CompetitorContent;
}

export const COMPETITORS: Competitor[] = [
  {
    slug: "book4time",
    name: "Book4Time",
    category: "spaHotel",
    origin: "Canada — groupe Agilysys (USA)",
    matrix: {
      emailToBookingAi: "no",
      transparentPricing: "no",
      multilingual: "yes",
      euCompliance: "partial",
      therapistApp: "partial",
      clientBooking: "yes",
      pmsHotel: "yes",
      unifiedAgenda: "yes",
      payments: "yes",
      giftCards: "yes",
      autoInvoicing: "partial",
      notifications: "yes",
      apiAccess: "yes",
      staycationIntegration: "no",
    },
    sources: [
      {
        label: "Book4Time by Agilysys — page produit",
        url: "https://www.agilysys.com/en/products/book4time/",
        checkedAt: "2026-09-11",
      },
      {
        label: "Book4Time — intégrations logicielles (PMS, paiement, API ouverte)",
        url: "https://www.agilysys.com/en/products/book4time/book4time-software-integrations/",
        checkedAt: "2026-09-11",
      },
      {
        label: "Agilysys — acquisition de Book4Time (août 2024)",
        url: "https://www.phocuswire.com/agilysys-acquires-book4time-spa-management-saas-solution-leader",
        checkedAt: "2026-09-11",
      },
      {
        label: "Mews Marketplace — Book4Time Spa Solution",
        url: "https://www.mews.com/en/products/marketplace/category/spa-management",
        checkedAt: "2026-09-11",
      },
    ],
    fr: {
      tagline: "Logiciel spa entreprise pour hôtels et resorts haut de gamme",
      bestFor: "Grands groupes hôteliers et resorts multi-sites avec budget et équipe IT dédiée.",
      summary:
        "Book4Time est l'un des rares acteurs pensés nativement pour le spa hôtelier, avec des intégrations PMS solides et une présence dans plus de 100 pays. Racheté par Agilysys en 2024, c'est une plateforme entreprise, commercialisée sur devis et pensée pour les grands comptes. Saoma vise la même verticale avec une approche plus légère, mobile-first et à prix public.",
      saomaAdvantages: [
        "Tarif public et sans engagement long : vous savez ce que vous payez avant le premier échange commercial.",
        "Réception des demandes par email lues et qualifiées automatiquement par IA, transformées en réservation en un clic.",
        "App thérapeute mobile (PWA) utilisable sur le téléphone de l'équipe, sans matériel dédié.",
        "Réservation client sans friction (QR code, sans création de compte), pensée pour le parcours invité de l'hôtel.",
      ],
      competitorStrengths: [
        "Très installé chez les grands groupes hôteliers et resorts internationaux, dans plus de 100 pays.",
        "Large couverture fonctionnelle (retail, memberships, multi-devises, analytics) pour des opérations complexes.",
        "Écosystème d'intégrations éprouvé : plus de 60 systèmes hôteliers et une API ouverte.",
        "Adossé au groupe Agilysys, acteur établi des technologies d'hospitalité.",
      ],
      faq: [
        {
          q: "Saoma est-il une alternative à Book4Time pour un spa d'hôtel ?",
          a: "Oui. Saoma cible la même verticale — la gestion du spa hôtelier avec intégration PMS Opera Cloud et Mews — mais avec un tarif public, une mise en route rapide et une app thérapeute mobile, là où Book4Time est une plateforme entreprise commercialisée sur devis.",
        },
        {
          q: "Book4Time et Saoma s'intègrent-ils tous les deux à Opera et Mews ?",
          a: "Oui, les deux proposent une intégration PMS hôtelier : Book4Time revendique plus de 60 systèmes hôteliers connectés, et Saoma intègre nativement Opera Cloud et Mews avec le room charge. Sur ce point, le choix se joue moins sur la connectivité que sur le format d'accompagnement et le prix.",
        },
        {
          q: "Lequel choisir pour un spa indépendant ou un petit groupe ?",
          a: "Book4Time prend tout son sens sur de très grandes opérations multi-sites avec une équipe IT dédiée. Pour un spa indépendant ou un groupe de taille moyenne, Saoma est généralement plus adapté : prix lisible, interface moderne et déploiement léger.",
        },
      ],
    },
    en: {
      tagline: "Enterprise spa software for upscale hotels and resorts",
      bestFor: "Large hotel groups and multi-site resorts with budget and a dedicated IT team.",
      summary:
        "Book4Time is one of the few vendors built natively for hotel spas, with strong PMS integrations and a presence in over 100 countries. Acquired by Agilysys in 2024, it is an enterprise platform, sold via quotes and designed for large accounts. Saoma targets the same vertical with a lighter, mobile-first approach and public pricing.",
      saomaAdvantages: [
        "Public pricing with no long lock-in: you know what you pay before the first sales call.",
        "Inbound email requests read and qualified automatically by AI, turned into a booking in one click.",
        "Therapist mobile app (PWA) that runs on the team's own phones, no dedicated hardware.",
        "Frictionless guest booking (QR code, no account creation) designed for the hotel guest journey.",
      ],
      competitorStrengths: [
        "Deeply established across large international hotel groups and resorts, in 100+ countries.",
        "Broad feature coverage (retail, memberships, multi-currency, analytics) for complex operations.",
        "Proven integration ecosystem: 60+ hotel systems and an open API.",
        "Backed by Agilysys, an established hospitality technology group.",
      ],
      faq: [
        {
          q: "Is Saoma an alternative to Book4Time for a hotel spa?",
          a: "Yes. Saoma targets the same vertical — hotel spa management with Opera Cloud and Mews PMS integration — but with public pricing, fast onboarding and a therapist mobile app, where Book4Time is an enterprise platform sold via quotes.",
        },
        {
          q: "Do both Book4Time and Saoma integrate with Opera and Mews?",
          a: "Yes, both offer hotel PMS integration: Book4Time advertises 60+ connected hotel systems, and Saoma integrates natively with Opera Cloud and Mews including room charge. The decision here rests less on connectivity than on the engagement model and price.",
        },
        {
          q: "Which should I pick for an independent spa or small group?",
          a: "Book4Time makes most sense for very large multi-site operations with a dedicated IT team. For an independent spa or a mid-sized group, Saoma is usually the better fit: clear pricing, a modern interface and a light rollout.",
        },
      ],
    },
  },
  {
    slug: "mindbody",
    name: "Mindbody",
    category: "spaWellness",
    origin: "USA",
    matrix: {
      emailToBookingAi: "no",
      transparentPricing: "partial",
      multilingual: "partial",
      euCompliance: "partial",
      therapistApp: "partial",
      clientBooking: "yes",
      pmsHotel: "partial",
      unifiedAgenda: "yes",
      payments: "yes",
      giftCards: "yes",
      autoInvoicing: "partial",
      notifications: "yes",
      apiAccess: "yes",
      staycationIntegration: "no",
    },
    sources: [
      {
        label: "Mindbody — page produit Booker (offre spa & salon du groupe)",
        url: "https://www.mindbodyonline.com/business/booker",
        checkedAt: "2026-09-11",
      },
      {
        label: "Mindbody Developer Portal — API publique",
        url: "https://developers.mindbodyonline.com/ui/documentation/consumer-api",
        checkedAt: "2026-09-11",
      },
    ],
    fr: {
      tagline: "Plateforme bien-être grand public (fitness, yoga, spa, salons)",
      bestFor: "Studios fitness/yoga et chaînes wellness, surtout sur le marché nord-américain.",
      summary:
        "Mindbody est une plateforme bien-être très répandue, doublée d'une place de marché grand public. Elle est généraliste et centrée sur le marché nord-américain ; c'est son offre sœur Booker qui porte le volet spa hôtelier. Saoma est spécialisé sur le spa d'hôtel : intégration PMS, app thérapeute et parcours invité, avec une interface FR/EN et un hébergement européen.",
      saomaAdvantages: [
        "Spécialisation spa hôtelier : intégration Opera Cloud et Mews avec room charge au cœur du produit, pas via une offre annexe.",
        "Interface et emails FR/EN, support et hébergement en Europe (RGPD).",
        "Demandes par email qualifiées automatiquement par IA et converties en réservation.",
        "Tarif public, sans commission sur les réservations.",
      ],
      competitorStrengths: [
        "Place de marché grand public qui peut générer de la visibilité, surtout aux États-Unis.",
        "Écosystème très large (memberships, cours collectifs, marketing) pour studios fitness.",
        "API publique documentée et large écosystème de partenaires.",
        "Marque établie avec une très grande base d'utilisateurs.",
      ],
      faq: [
        {
          q: "Saoma est-il une alternative à Mindbody pour un spa ?",
          a: "Oui. Pour un spa, surtout en hôtel, Saoma offre une intégration PMS native, une app thérapeute mobile et une interface FR/EN avec hébergement européen, là où Mindbody est une plateforme bien-être généraliste centrée sur le marché nord-américain.",
        },
        {
          q: "Mindbody s'intègre-t-il aux PMS hôteliers comme Opera ou Mews ?",
          a: "C'est Booker, l'offre spa et salon du groupe Mindbody, qui porte la connectivité hôtelière — voir notre comparatif Saoma vs Booker. Chez Saoma, l'intégration Opera Cloud et Mews avec room charge est native au produit principal.",
        },
        {
          q: "Mindbody convient-il à un spa en Europe ?",
          a: "Mindbody est centré sur les États-Unis ; la langue de l'interface, le support et la localisation des données méritent d'être vérifiés selon vos contraintes. Saoma propose une interface FR/EN, un support européen et un hébergement UE conforme au RGPD.",
        },
      ],
    },
    en: {
      tagline: "Consumer wellness platform (fitness, yoga, spa, salons)",
      bestFor: "Fitness/yoga studios and wellness chains, mostly in the North American market.",
      summary:
        "Mindbody is a widely used wellness platform paired with a consumer marketplace. It is generalist and US-centric; its sibling product Booker carries the hotel spa side. Saoma specializes in hotel spas: PMS integration, therapist app and guest journey, with an FR/EN interface and EU hosting.",
      saomaAdvantages: [
        "Hotel spa specialization: Opera Cloud and Mews integration with room charge at the core of the product, not through a separate offering.",
        "FR/EN interface and emails, European support and hosting (GDPR).",
        "Inbound email requests qualified automatically by AI and turned into bookings.",
        "Public pricing, with no commission on bookings.",
      ],
      competitorStrengths: [
        "Consumer marketplace that can drive visibility, especially in the US.",
        "Very broad ecosystem (memberships, group classes, marketing) for fitness studios.",
        "Documented public API and a large partner ecosystem.",
        "Established brand with a very large user base.",
      ],
      faq: [
        {
          q: "Is Saoma an alternative to Mindbody for a spa?",
          a: "Yes. For a spa, especially in a hotel, Saoma offers native PMS integration, a therapist mobile app and an FR/EN interface with EU hosting, where Mindbody is a generalist wellness platform focused on North America.",
        },
        {
          q: "Does Mindbody integrate with hotel PMS like Opera or Mews?",
          a: "Hotel connectivity sits with Booker, the Mindbody group's spa and salon product — see our Saoma vs Booker comparison. At Saoma, Opera Cloud and Mews integration with room charge is native to the main product.",
        },
        {
          q: "Is Mindbody suitable for a spa in Europe?",
          a: "Mindbody is US-centric; interface language, support and data location are worth checking against your own constraints. Saoma offers an FR/EN interface, European support and GDPR-compliant EU hosting.",
        },
      ],
    },
  },
  {
    slug: "booker",
    name: "Booker (SpaBooker)",
    category: "spaWellness",
    origin: "USA — groupe Mindbody",
    matrix: {
      emailToBookingAi: "no",
      transparentPricing: "partial",
      multilingual: "partial",
      euCompliance: "partial",
      therapistApp: "partial",
      clientBooking: "yes",
      pmsHotel: "partial",
      unifiedAgenda: "yes",
      payments: "yes",
      giftCards: "yes",
      autoInvoicing: "partial",
      notifications: "yes",
      apiAccess: "yes",
      staycationIntegration: "no",
    },
    sources: [
      {
        label: "Booker — offre spa hôtelier",
        url: "https://www.booker.com/hotel-spa-software",
        checkedAt: "2026-09-11",
      },
      {
        label: "Mews Marketplace — Booker Spa Interface",
        url: "https://www.mews.com/en/products/marketplace/booker-spa-interface",
        checkedAt: "2026-09-11",
      },
      {
        label: "StayNTouch — intégration Spa Booker",
        url: "https://www.stayntouch.com/snt-integrations-new/spa-booker/",
        checkedAt: "2026-09-11",
      },
      {
        label: "Mindbody Developer Portal — Booker API",
        url: "https://developers.mindbodyonline.com/ui/documentation/booker-api",
        checkedAt: "2026-09-11",
      },
    ],
    fr: {
      tagline: "Logiciel de réservation spa & salon, dans l'écosystème Mindbody",
      bestFor: "Spas et salons nord-américains cherchant un outil de réservation établi et éprouvé.",
      summary:
        "Booker (anciennement SpaBooker) est une solution de réservation spa et salon historique, aujourd'hui rattachée à Mindbody. Elle dispose d'une offre dédiée au spa hôtelier et se connecte à des PMS comme Mews ou StayNTouch. C'est un outil mature, centré sur le marché nord-américain. Saoma se distingue par sa spécialisation européenne, son IA de traitement des demandes et son tarif public.",
      saomaAdvantages: [
        "Interface, emails et support en FR/EN, avec un hébergement européen conforme au RGPD.",
        "Demandes de réservation reçues par email lues et qualifiées automatiquement par IA — un point sur lequel Booker ne communique pas.",
        "Tarif public sans commission sur les réservations.",
        "App thérapeute mobile et facturation automatique hôtel/thérapeute pensées pour le modèle d'exploitation européen.",
      ],
      competitorStrengths: [
        "Solution établie avec de nombreuses années d'expérience sur le marché spa et salon.",
        "Offre dédiée au spa hôtelier, avec connexion au PMS (Mews, StayNTouch) pour le report des prestations.",
        "Fonctionnalités matures de gestion de salon, de retail et de fidélité.",
        "API documentée et adossement à l'écosystème et au support de Mindbody.",
      ],
      faq: [
        {
          q: "Quelle est la différence entre Saoma et Booker (SpaBooker) ?",
          a: "Les deux adressent le spa hôtelier et se connectent à un PMS. La différence tient au terrain : Saoma est conçu et hébergé en Europe, avec une interface et des emails FR/EN, un tarif public sans commission et une IA qui transforme les demandes reçues par email en réservations. Booker est un acteur nord-américain mature, adossé à Mindbody.",
        },
        {
          q: "Booker propose-t-il un room charge vers le PMS de l'hôtel ?",
          a: "Booker dispose d'une offre spa hôtelier et est référencé sur le Mews Marketplace ainsi que chez StayNTouch : la connexion au PMS existe. Nous vous invitons à vérifier auprès de l'éditeur la couverture exacte pour votre PMS. Chez Saoma, le room charge est natif sur Opera Cloud et Mews.",
        },
        {
          q: "Booker est-il adapté à un spa européen ?",
          a: "Booker est avant tout déployé sur le marché nord-américain. Pour l'Europe, Saoma offre une interface et des emails FR/EN, un support européen et un hébergement UE conforme au RGPD — des points à comparer selon vos obligations.",
        },
      ],
    },
    en: {
      tagline: "Spa & salon booking software, part of the Mindbody ecosystem",
      bestFor: "North American spas and salons looking for an established, proven booking tool.",
      summary:
        "Booker (formerly SpaBooker) is a long-standing spa and salon booking solution, now part of Mindbody. It has a dedicated hotel spa offering and connects to PMS platforms such as Mews and StayNTouch. It is a mature tool, focused on North America. Saoma stands apart through its European specialization, its AI request handling and its public pricing.",
      saomaAdvantages: [
        "Interface, emails and support in FR/EN, with GDPR-compliant European hosting.",
        "Inbound email requests read and qualified automatically by AI — something Booker does not advertise.",
        "Public pricing with no commission on bookings.",
        "Therapist mobile app and automatic hotel/therapist invoicing built for the European operating model.",
      ],
      competitorStrengths: [
        "Established solution with many years of experience in the spa and salon market.",
        "Dedicated hotel spa offering, with PMS connectivity (Mews, StayNTouch) for posting treatments.",
        "Mature salon management, retail and loyalty features.",
        "Documented API and the backing of the Mindbody ecosystem and support.",
      ],
      faq: [
        {
          q: "What's the difference between Saoma and Booker (SpaBooker)?",
          a: "Both address hotel spas and connect to a PMS. The difference is the ground they cover: Saoma is built and hosted in Europe, with an FR/EN interface and emails, public pricing with no commission, and AI that turns inbound email requests into bookings. Booker is a mature North American player backed by Mindbody.",
        },
        {
          q: "Does Booker support room charge to the hotel PMS?",
          a: "Booker has a hotel spa offering and is listed on the Mews Marketplace as well as with StayNTouch, so PMS connectivity does exist. We recommend checking exact coverage for your PMS with the vendor. At Saoma, room charge is native on Opera Cloud and Mews.",
        },
        {
          q: "Is Booker suitable for a European spa?",
          a: "Booker is primarily deployed in North America. For Europe, Saoma offers an FR/EN interface and emails, European support and GDPR-compliant EU hosting — worth comparing against your own obligations.",
        },
      ],
    },
  },
  {
    slug: "zenoti",
    name: "Zenoti",
    category: "spaWellness",
    origin: "USA / Inde",
    matrix: {
      emailToBookingAi: "partial",
      transparentPricing: "no",
      multilingual: "partial",
      euCompliance: "partial",
      therapistApp: "partial",
      clientBooking: "yes",
      pmsHotel: "yes",
      unifiedAgenda: "yes",
      payments: "yes",
      giftCards: "yes",
      autoInvoicing: "partial",
      notifications: "yes",
      apiAccess: "yes",
      staycationIntegration: "no",
    },
    sources: [
      {
        label: "Zenoti — offre resort spa",
        url: "https://www.zenoti.com/spa-management-software/resort-spa",
        checkedAt: "2026-09-11",
      },
      {
        label: "Zenoti Help — intégration Opera Cloud (room posting)",
        url: "https://help.zenoti.com/en/configuration/zenoti-payments-configurations/customer-payments/opera-cloud-integration.html",
        checkedAt: "2026-09-11",
      },
      {
        label: "Zenoti Help — intégration Opera on-premise",
        url: "https://help.zenoti.com/en/integrations/opera-on-premise.html",
        checkedAt: "2026-09-11",
      },
      {
        label: "Zenoti — AI Receptionist",
        url: "https://www.zenoti.com/ai-workforce/ai-receptionist",
        checkedAt: "2026-09-11",
      },
      {
        label: "Zenoti — RGPD et conformité",
        url: "https://www.zenoti.com/blog/gdpr-and-zenoti-what-you-need-to-know/",
        checkedAt: "2026-09-11",
      },
    ],
    fr: {
      tagline: "Plateforme entreprise pour spas, medspas et chaînes wellness",
      bestFor: "Chaînes de spas et medspas multi-sites avec des besoins opérationnels complexes.",
      summary:
        "Zenoti est une plateforme entreprise riche en fonctionnalités, populaire chez les chaînes de spas et medspas, avec une offre resort spa et une intégration Opera documentée. Très complète, elle s'accompagne d'une tarification sur devis, d'une mise en œuvre conséquente et d'une courbe d'apprentissage. Saoma offre une alternative plus légère et spécialisée sur le spa hôtelier européen, à prix public.",
      saomaAdvantages: [
        "Périmètre resserré et interface épurée : l'équipe du spa est autonome en quelques jours.",
        "Tarif public, sans devis ni paliers commerciaux.",
        "Traitement des demandes reçues par email par IA, converties en réservation — Zenoti positionne son IA surtout sur l'accueil téléphonique.",
        "Interface, emails et support FR/EN avec hébergement européen, pensés pour l'exploitation en France et en Europe.",
      ],
      competitorStrengths: [
        "Suite très complète (CRM, marketing, inventaire, IA) pour les grandes chaînes.",
        "Intégration Opera documentée (cloud et on-premise) avec report des prestations sur la chambre.",
        "Solide pour les opérations medspa et multi-sites internationales.",
        "Automatisations marketing, IA d'accueil téléphonique et reporting avancés.",
      ],
      faq: [
        {
          q: "Saoma est-il une alternative plus simple à Zenoti ?",
          a: "Oui. Zenoti est une suite entreprise très complète, mais son périmètre et son déploiement sont conséquents. Saoma propose une alternative plus légère, spécialisée sur le spa hôtelier, avec intégration PMS, app thérapeute et tarif public.",
        },
        {
          q: "Zenoti s'intègre-t-il aux PMS hôteliers ?",
          a: "Oui : Zenoti documente une intégration Opera, en version cloud et on-premise, avec report des prestations sur la chambre. Saoma propose la même logique de room charge sur Opera Cloud et Mews. La comparaison se joue donc plutôt sur le périmètre, le prix et l'accompagnement.",
        },
        {
          q: "Pour quel type d'établissement Saoma est-il préférable ?",
          a: "Pour un spa d'hôtel ou un groupe de taille moyenne souhaitant un déploiement rapide et un prix lisible, Saoma est généralement plus adapté. Zenoti vise les très grandes chaînes aux besoins étendus.",
        },
      ],
    },
    en: {
      tagline: "Enterprise platform for spas, medspas and wellness chains",
      bestFor: "Multi-site spa and medspa chains with complex operational needs.",
      summary:
        "Zenoti is a feature-rich enterprise platform popular with spa and medspa chains, with a resort spa offering and documented Opera integration. Very complete, it comes with quote-based pricing, a substantial implementation and a learning curve. Saoma offers a lighter alternative specialized in European hotel spas, with public pricing.",
      saomaAdvantages: [
        "Tighter scope and a clean interface: the spa team is self-sufficient within days.",
        "Public pricing, no quotes or sales tiers.",
        "AI handling of inbound email requests, turned into bookings — Zenoti positions its AI mainly around phone reception.",
        "FR/EN interface, emails and support with European hosting, built for operating in France and Europe.",
      ],
      competitorStrengths: [
        "Very complete suite (CRM, marketing, inventory, AI) for large chains.",
        "Documented Opera integration (cloud and on-premise) with room posting.",
        "Strong for medspa operations and international multi-site setups.",
        "Advanced marketing automation, AI phone reception and reporting.",
      ],
      faq: [
        {
          q: "Is Saoma a simpler alternative to Zenoti?",
          a: "Yes. Zenoti is a very complete enterprise suite, but its scope and rollout are substantial. Saoma offers a lighter alternative specialized in hotel spas, with PMS integration, a therapist app and public pricing.",
        },
        {
          q: "Does Zenoti integrate with hotel PMS?",
          a: "Yes: Zenoti documents an Opera integration, both cloud and on-premise, with room posting. Saoma offers the same room-charge logic on Opera Cloud and Mews. The comparison therefore comes down to scope, price and support.",
        },
        {
          q: "Which type of venue is Saoma better for?",
          a: "For a hotel spa or a mid-sized group wanting fast deployment and clear pricing, Saoma is usually the better fit. Zenoti targets very large chains with extensive needs.",
        },
      ],
    },
  },
  {
    slug: "fresha",
    name: "Fresha",
    category: "marketplace",
    origin: "Royaume-Uni",
    matrix: {
      emailToBookingAi: "no",
      transparentPricing: "partial",
      multilingual: "yes",
      euCompliance: "yes",
      therapistApp: "partial",
      clientBooking: "yes",
      pmsHotel: "no",
      unifiedAgenda: "yes",
      payments: "yes",
      giftCards: "yes",
      autoInvoicing: "no",
      notifications: "yes",
      apiAccess: "no",
      staycationIntegration: "no",
    },
    sources: [
      {
        label: "Fresha — tarifs professionnels",
        url: "https://www.fresha.com/for-business/pricing",
        checkedAt: "2026-09-11",
      },
      {
        label: "Fresha — lancement de la plateforme en neuf langues",
        url: "https://www.prnewswire.com/apac/news-releases/fresha-accelerates-global-growth-and-expands-into-new-markets-with-launch-of-platform-in-nine-languages-301906816.html",
        checkedAt: "2026-09-11",
      },
    ],
    fr: {
      tagline: "Logiciel de réservation salon & beauté adossé à une place de marché",
      bestFor: "Salons de beauté, barbiers et indépendants cherchant un outil simple avec place de marché.",
      summary:
        "Fresha est très populaire auprès des salons de beauté, avec une place de marché grand public et une présence dans une quinzaine de pays. Son modèle combine abonnement par collaborateur, commission sur les nouveaux clients issus de la marketplace et frais de paiement. Il est centré sur la beauté grand public, sans intégration PMS hôtelier ni facturation B2B hôtel/thérapeute — le terrain de Saoma.",
      saomaAdvantages: [
        "Intégration PMS hôtelier (Opera Cloud, Mews) et room charge, hors du périmètre de Fresha.",
        "Facturation automatique hôtel et thérapeute, adaptée au modèle de commission du spa hôtelier.",
        "Pas de commission sur les réservations : un abonnement prévisible, sans reversement sur les nouveaux clients.",
        "Parcours invité d'hôtel (QR, sans compte), agenda multi-lieux/salles et qualification des demandes email par IA.",
      ],
      competitorStrengths: [
        "Très simple à prendre en main et rapide à mettre en place pour un salon indépendant.",
        "Place de marché grand public qui peut amener de nouveaux clients.",
        "Disponible dans une quinzaine de pays et une dizaine de langues.",
        "Éditeur européen, avec les garanties RGPD associées.",
      ],
      faq: [
        {
          q: "Saoma est-il une alternative à Fresha pour un spa ?",
          a: "Oui, pour un spa d'hôtel. Fresha cible la beauté grand public avec une place de marché ; Saoma se concentre sur le spa hôtelier avec intégration PMS, facturation B2B et un abonnement sans commission sur les réservations.",
        },
        {
          q: "Fresha est-il gratuit ?",
          a: "Fresha a fonctionné pendant des années sur un modèle gratuit financé par les commissions, mais l'offre est passée à un abonnement payant par collaborateur en 2026, auquel s'ajoutent une commission sur les nouveaux clients de la place de marché et des frais de paiement. Saoma applique un abonnement transparent sans commission sur les réservations.",
        },
        {
          q: "Fresha gère-t-il le spa d'un hôtel ?",
          a: "Fresha s'adresse aux salons et instituts, et ne communique pas d'intégration PMS hôtelier ni de room charge. Saoma intègre nativement Opera Cloud et Mews pour le spa hôtelier.",
        },
      ],
    },
    en: {
      tagline: "Salon & beauty booking software backed by a marketplace",
      bestFor: "Beauty salons, barbers and independents wanting a simple tool with a marketplace.",
      summary:
        "Fresha is very popular with beauty salons, with a consumer marketplace and a presence in around fifteen countries. Its model combines a per-team-member subscription, a commission on new clients from the marketplace and payment fees. It is consumer beauty–focused, with no hotel PMS integration and no B2B hotel/therapist invoicing — which is Saoma's ground.",
      saomaAdvantages: [
        "Hotel PMS integration (Opera Cloud, Mews) and room charge, outside Fresha's scope.",
        "Automatic hotel and therapist invoicing, matched to the hotel spa commission model.",
        "No commission on bookings: a predictable subscription, with no cut on new clients.",
        "Hotel guest journey (QR, no account), multi-venue/room agenda and AI qualification of email requests.",
      ],
      competitorStrengths: [
        "Very easy to pick up and quick to set up for an independent salon.",
        "Consumer marketplace that can bring in new clients.",
        "Available in around fifteen countries and roughly ten languages.",
        "European vendor, with the associated GDPR guarantees.",
      ],
      faq: [
        {
          q: "Is Saoma an alternative to Fresha for a spa?",
          a: "Yes, for a hotel spa. Fresha targets consumer beauty with a marketplace; Saoma focuses on hotel spas with PMS integration, B2B invoicing and a subscription with no commission on bookings.",
        },
        {
          q: "Is Fresha free?",
          a: "Fresha ran for years on a free model funded by commissions, but moved to a paid per-team-member subscription in 2026, on top of which sit a marketplace new-client commission and payment fees. Saoma uses a transparent subscription with no commission on bookings.",
        },
        {
          q: "Does Fresha handle a hotel spa?",
          a: "Fresha addresses salons and beauty businesses, and does not advertise hotel PMS integration or room charge. Saoma integrates natively with Opera Cloud and Mews for hotel spas.",
        },
      ],
    },
  },
  {
    slug: "treatwell",
    name: "Treatwell",
    category: "marketplace",
    origin: "Royaume-Uni / Europe",
    matrix: {
      emailToBookingAi: "no",
      transparentPricing: "partial",
      multilingual: "yes",
      euCompliance: "yes",
      therapistApp: "partial",
      clientBooking: "yes",
      pmsHotel: "no",
      unifiedAgenda: "yes",
      payments: "yes",
      giftCards: "yes",
      autoInvoicing: "no",
      notifications: "yes",
      apiAccess: "partial",
      staycationIntegration: "no",
    },
    sources: [
      {
        label: "Treatwell — tarifs partenaires (commission nouveaux clients, 0 % récurrents)",
        url: "https://www.treatwell.nl/en/partners/pricing/",
        checkedAt: "2026-09-11",
      },
    ],
    fr: {
      tagline: "Place de marché beauté/bien-être européenne + logiciel pro (Treatwell Pro)",
      bestFor: "Salons et instituts européens cherchant l'acquisition client via une place de marché.",
      summary:
        "Treatwell est une place de marché beauté et bien-être grand public en Europe, doublée d'un logiciel de gestion (Treatwell Pro). Son intérêt principal est l'acquisition de clients via la marketplace, contre une commission sur les premières réservations. Il n'est pas positionné sur le spa hôtelier ni l'intégration PMS. Saoma se concentre sur l'exploitation du spa d'hôtel plutôt que sur l'acquisition.",
      saomaAdvantages: [
        "Intégration PMS hôtelier (Opera Cloud, Mews) et room charge, hors du périmètre de Treatwell.",
        "Aucune commission sur les réservations, y compris sur les nouveaux clients.",
        "Facturation automatique hôtel/thérapeute, app thérapeute mobile et agenda multi-lieux/salles.",
        "Maîtrise de la relation client de l'hôtel, sans intermédiation par une place de marché.",
      ],
      competitorStrengths: [
        "Forte place de marché grand public en Europe pour générer des réservations.",
        "Commission uniquement sur la première réservation d'un nouveau client, puis 0 % sur les clients récurrents.",
        "Grille tarifaire publiée publiquement sur son site partenaires.",
        "Présence multi-pays et multilingue en Europe.",
      ],
      faq: [
        {
          q: "Saoma est-il une alternative à Treatwell pour un spa ?",
          a: "Pour un spa d'hôtel, oui. Treatwell est avant tout une place de marché d'acquisition ; Saoma est un logiciel d'exploitation du spa hôtelier avec intégration PMS, facturation B2B et abonnement sans commission.",
        },
        {
          q: "Treatwell prélève-t-il une commission ?",
          a: "Le modèle de Treatwell repose sur une commission appliquée à la première réservation des nouveaux clients venus de la place de marché, sans commission sur les clients récurrents. Saoma fonctionne par abonnement, sans commission sur les réservations.",
        },
        {
          q: "Peut-on utiliser Treatwell et Saoma ensemble ?",
          a: "Oui, ils répondent à des besoins différents : Treatwell pour l'acquisition via la marketplace, Saoma pour piloter l'exploitation du spa (agenda, PMS, thérapeutes, facturation).",
        },
      ],
    },
    en: {
      tagline: "European beauty/wellness marketplace + pro software (Treatwell Pro)",
      bestFor: "European salons and spas seeking client acquisition through a marketplace.",
      summary:
        "Treatwell is a consumer beauty and wellness marketplace in Europe, paired with management software (Treatwell Pro). Its main value is client acquisition through the marketplace, in exchange for a commission on first bookings. It is not positioned on hotel spas or PMS integration. Saoma focuses on running the hotel spa rather than on acquisition.",
      saomaAdvantages: [
        "Hotel PMS integration (Opera Cloud, Mews) and room charge, outside Treatwell's scope.",
        "No commission on bookings, including on new clients.",
        "Automatic hotel/therapist invoicing, therapist mobile app and multi-venue/room agenda.",
        "You own the hotel's client relationship, with no marketplace intermediation.",
      ],
      competitorStrengths: [
        "Strong consumer marketplace in Europe to generate bookings.",
        "Commission only on a new client's first booking, then 0% on repeat clients.",
        "Pricing published openly on its partner site.",
        "Multi-country, multilingual presence across Europe.",
      ],
      faq: [
        {
          q: "Is Saoma an alternative to Treatwell for a spa?",
          a: "For a hotel spa, yes. Treatwell is primarily an acquisition marketplace; Saoma is operational software for the hotel spa with PMS integration, B2B invoicing and a commission-free subscription.",
        },
        {
          q: "Does Treatwell charge a commission?",
          a: "Treatwell's model applies a commission to a new marketplace client's first booking, with no commission on repeat clients. Saoma works on a subscription, with no commission on bookings.",
        },
        {
          q: "Can Treatwell and Saoma be used together?",
          a: "Yes, they serve different needs: Treatwell for marketplace acquisition, Saoma to run spa operations (agenda, PMS, therapists, invoicing).",
        },
      ],
    },
  },
];

export function getCompetitor(slug: string | undefined): Competitor | undefined {
  if (!slug) return undefined;
  return COMPETITORS.find((c) => c.slug === slug);
}
