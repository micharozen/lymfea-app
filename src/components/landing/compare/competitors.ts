// Comparison data for the public "Saoma vs ..." marketing pages.
//
// IMPORTANT — fairness & legal: competitor capabilities below reflect publicly
// available information and are intentionally neutral. They are not guaranteed
// to be exhaustive or up to date. Re-verify before each major marketing push and
// keep `DATA_AS_OF` current. The disclaimer shown on-page references this date.

export const DATA_AS_OF = "2026-06";

/** A single feature-matrix cell value. `soon` = on the roadmap / coming soon. */
export type Cell = "yes" | "partial" | "no" | "soon";

/**
 * Comparison dimensions, ordered for display. Each key maps to a label in the
 * `compare` i18n namespace (`dimensions.<key>`). These are deliberately chosen
 * to surface Saoma's positioning (hotel spa + PMS + therapist mobility + EU).
 */
export const DIMENSION_KEYS = [
  "pmsHotel",
  "emailToBookingAi",
  "advancedCustomization",
  "therapistApp",
  "clientBooking",
  "unifiedAgenda",
  "payments",
  "giftCards",
  "autoInvoicing",
  "notifications",
  "apiAccess",
  "staycationIntegration",
  "multilingual",
  "euCompliance",
  "transparentPricing",
] as const;

export type DimensionKey = (typeof DIMENSION_KEYS)[number];

/** Saoma's own column — strengths the comparison dimensions are built around. */
export const SAOMA_MATRIX: Record<DimensionKey, Cell> = {
  pmsHotel: "yes",
  emailToBookingAi: "yes",
  advancedCustomization: "yes",
  therapistApp: "yes",
  clientBooking: "yes",
  unifiedAgenda: "yes",
  payments: "yes",
  giftCards: "yes",
  autoInvoicing: "yes",
  notifications: "yes",
  apiAccess: "yes",
  staycationIntegration: "soon",
  multilingual: "yes",
  euCompliance: "yes",
  transparentPricing: "yes",
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
  fr: CompetitorContent;
  en: CompetitorContent;
}

export const COMPETITORS: Competitor[] = [
  {
    slug: "book4time",
    name: "Book4Time",
    category: "spaHotel",
    origin: "Canada / USA",
    matrix: {
      pmsHotel: "yes",
      emailToBookingAi: "no",
      advancedCustomization: "partial",
      therapistApp: "partial",
      clientBooking: "yes",
      unifiedAgenda: "yes",
      payments: "yes",
      giftCards: "yes",
      autoInvoicing: "partial",
      notifications: "yes",
      apiAccess: "partial",
      staycationIntegration: "no",
      multilingual: "partial",
      euCompliance: "partial",
      transparentPricing: "no",
    },
    fr: {
      tagline: "Logiciel spa entreprise pour hôtels et resorts haut de gamme",
      bestFor: "Grands groupes hôteliers et resorts multi-sites avec budget et équipe IT dédiée.",
      summary:
        "Book4Time est l'un des rares concurrents pensés nativement pour le spa hôtelier, avec des intégrations PMS solides. C'est une plateforme entreprise : puissante, mais à la tarification sur devis, à l'onboarding long et à l'ergonomie pensée pour les grands comptes. Saoma vise la même verticale avec une approche moderne, mobile-first et à prix transparent.",
      saomaAdvantages: [
        "Tarif transparent et sans engagement lourd, là où Book4Time fonctionne sur devis entreprise et contrats annuels.",
        "App thérapeute mobile (PWA) native avec encaissement et reversements Stripe Connect, sans matériel dédié.",
        "Mise en route en quelques jours plutôt qu'un déploiement entreprise de plusieurs semaines.",
        "Réservation client sans friction (QR code, sans création de compte) pensée pour le parcours invité de l'hôtel.",
      ],
      competitorStrengths: [
        "Très installé chez les grands groupes hôteliers et resorts internationaux.",
        "Large couverture fonctionnelle (retail, memberships, multi-devises) pour des opérations complexes.",
        "Écosystème d'intégrations PMS et POS éprouvé à grande échelle.",
      ],
      faq: [
        {
          q: "Saoma est-il une alternative à Book4Time pour un spa d'hôtel ?",
          a: "Oui. Saoma cible la même verticale — la gestion du spa hôtelier avec intégration PMS Opera Cloud et Mews — mais avec une tarification transparente, une mise en route rapide et une app thérapeute mobile, là où Book4Time s'adresse surtout aux grands comptes via devis.",
        },
        {
          q: "Book4Time et Saoma s'intègrent-ils tous les deux à Opera et Mews ?",
          a: "Les deux proposent une intégration PMS hôtelier. Saoma met l'accent sur une intégration native Opera Cloud et Mews avec room charge, sans projet d'intégration entreprise lourd.",
        },
        {
          q: "Lequel choisir pour un spa indépendant ou un petit groupe ?",
          a: "Pour un spa indépendant ou un groupe de taille moyenne, Saoma est généralement plus adapté : déploiement rapide, prix lisible et interface moderne. Book4Time prend tout son sens sur de très grandes opérations multi-sites.",
        },
      ],
    },
    en: {
      tagline: "Enterprise spa software for upscale hotels and resorts",
      bestFor: "Large hotel groups and multi-site resorts with budget and a dedicated IT team.",
      summary:
        "Book4Time is one of the few competitors built natively for hotel spas, with strong PMS integrations. It is an enterprise platform: powerful, but quote-based, with a long onboarding and an interface designed for large accounts. Saoma targets the same vertical with a modern, mobile-first approach and transparent pricing.",
      saomaAdvantages: [
        "Transparent pricing with no heavy lock-in, where Book4Time runs on enterprise quotes and annual contracts.",
        "Native therapist mobile app (PWA) with in-treatment payment and Stripe Connect payouts, no dedicated hardware.",
        "Live in days rather than a multi-week enterprise rollout.",
        "Frictionless guest booking (QR code, no account creation) designed for the hotel guest journey.",
      ],
      competitorStrengths: [
        "Deeply established across large international hotel groups and resorts.",
        "Broad feature coverage (retail, memberships, multi-currency) for complex operations.",
        "Proven PMS and POS integration ecosystem at scale.",
      ],
      faq: [
        {
          q: "Is Saoma an alternative to Book4Time for a hotel spa?",
          a: "Yes. Saoma targets the same vertical — hotel spa management with Opera Cloud and Mews PMS integration — but with transparent pricing, fast onboarding and a therapist mobile app, where Book4Time mostly serves large accounts via quotes.",
        },
        {
          q: "Do both Book4Time and Saoma integrate with Opera and Mews?",
          a: "Both offer hotel PMS integration. Saoma focuses on native Opera Cloud and Mews integration with room charge, without a heavy enterprise integration project.",
        },
        {
          q: "Which should I pick for an independent spa or small group?",
          a: "For an independent spa or a mid-sized group, Saoma is usually the better fit: fast deployment, clear pricing and a modern interface. Book4Time makes most sense for very large multi-site operations.",
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
      pmsHotel: "no",
      emailToBookingAi: "no",
      advancedCustomization: "partial",
      therapistApp: "partial",
      clientBooking: "yes",
      unifiedAgenda: "yes",
      payments: "yes",
      giftCards: "yes",
      autoInvoicing: "partial",
      notifications: "yes",
      apiAccess: "yes",
      staycationIntegration: "no",
      multilingual: "partial",
      euCompliance: "partial",
      transparentPricing: "no",
    },
    fr: {
      tagline: "Plateforme bien-être grand public (fitness, yoga, spa, salons)",
      bestFor: "Studios fitness/yoga et chaînes wellness, surtout sur le marché nord-américain.",
      summary:
        "Mindbody est une plateforme bien-être très répandue avec une place de marché grand public. Elle est généraliste, centrée sur les États-Unis et reconnue pour sa complexité et ses paliers tarifaires élevés. Saoma est spécialisé sur le spa hôtelier : intégration PMS, app thérapeute et parcours invité, avec une interface FR/EN et un hébergement européen.",
      saomaAdvantages: [
        "Intégration PMS hôtelier (Opera Cloud, Mews) avec room charge — absente de Mindbody.",
        "Interface et emails FR/EN, support et hébergement en Europe (RGPD), là où Mindbody est centré USA.",
        "Tarification transparente sans paliers commerciaux complexes ni modules à tiroir.",
        "Conçu pour le spa hôtelier plutôt que comme un outil bien-être généraliste.",
      ],
      competitorStrengths: [
        "Place de marché grand public qui peut générer de la visibilité, surtout aux États-Unis.",
        "Écosystème très large (memberships, cours collectifs, marketing) pour studios fitness.",
        "Marque établie avec une grande base d'utilisateurs.",
      ],
      faq: [
        {
          q: "Saoma est-il une alternative à Mindbody pour un spa ?",
          a: "Oui. Pour un spa, surtout en hôtel, Saoma offre une intégration PMS, une app thérapeute mobile et une interface FR/EN avec hébergement européen, là où Mindbody est une plateforme bien-être généraliste centrée sur le marché nord-américain.",
        },
        {
          q: "Mindbody s'intègre-t-il aux PMS hôteliers comme Opera ou Mews ?",
          a: "Mindbody n'est pas pensé pour le spa hôtelier et ne propose pas d'intégration PMS native de type room charge. Saoma intègre nativement Opera Cloud et Mews.",
        },
        {
          q: "Mindbody convient-il à un spa en Europe ?",
          a: "Mindbody est centré sur les États-Unis ; le support, la langue et l'hébergement des données peuvent poser question en Europe. Saoma propose une interface FR/EN, un support européen et un hébergement UE conforme au RGPD.",
        },
      ],
    },
    en: {
      tagline: "Consumer wellness platform (fitness, yoga, spa, salons)",
      bestFor: "Fitness/yoga studios and wellness chains, mostly in the North American market.",
      summary:
        "Mindbody is a widely used wellness platform with a consumer marketplace. It is generalist, US-centric and known for its complexity and higher pricing tiers. Saoma specializes in hotel spas: PMS integration, therapist app and guest journey, with an FR/EN interface and EU hosting.",
      saomaAdvantages: [
        "Hotel PMS integration (Opera Cloud, Mews) with room charge — absent from Mindbody.",
        "FR/EN interface and emails, European support and hosting (GDPR), where Mindbody is US-centric.",
        "Transparent pricing without complex sales tiers or stacked add-on modules.",
        "Built for the hotel spa rather than as a generalist wellness tool.",
      ],
      competitorStrengths: [
        "Consumer marketplace that can drive visibility, especially in the US.",
        "Very broad ecosystem (memberships, group classes, marketing) for fitness studios.",
        "Established brand with a large user base.",
      ],
      faq: [
        {
          q: "Is Saoma an alternative to Mindbody for a spa?",
          a: "Yes. For a spa, especially in a hotel, Saoma offers PMS integration, a therapist mobile app and an FR/EN interface with EU hosting, where Mindbody is a generalist wellness platform focused on North America.",
        },
        {
          q: "Does Mindbody integrate with hotel PMS like Opera or Mews?",
          a: "Mindbody is not built for hotel spas and does not offer native room-charge PMS integration. Saoma integrates natively with Opera Cloud and Mews.",
        },
        {
          q: "Is Mindbody suitable for a spa in Europe?",
          a: "Mindbody is US-centric; support, language and data hosting can be a concern in Europe. Saoma offers an FR/EN interface, European support and GDPR-compliant EU hosting.",
        },
      ],
    },
  },
  {
    slug: "booker",
    name: "Booker (SpaBooker)",
    category: "spaWellness",
    origin: "USA",
    matrix: {
      pmsHotel: "no",
      emailToBookingAi: "no",
      advancedCustomization: "partial",
      therapistApp: "partial",
      clientBooking: "yes",
      unifiedAgenda: "yes",
      payments: "yes",
      giftCards: "yes",
      autoInvoicing: "partial",
      notifications: "yes",
      apiAccess: "partial",
      staycationIntegration: "no",
      multilingual: "no",
      euCompliance: "no",
      transparentPricing: "no",
    },
    fr: {
      tagline: "Logiciel de réservation spa & salon, désormais dans l'écosystème Mindbody",
      bestFor: "Spas et salons nord-américains cherchant un outil de réservation établi.",
      summary:
        "Booker (anciennement SpaBooker) est une solution de réservation spa et salon historique, aujourd'hui rattachée à Mindbody. C'est un outil éprouvé mais à l'interface vieillissante, centré sur le marché américain et sans intégration PMS hôtelier. Saoma propose une expérience moderne, mobile et pensée pour l'hôtel, en FR/EN.",
      saomaAdvantages: [
        "Intégration PMS hôtelier native (Opera Cloud, Mews) absente de Booker.",
        "Interface moderne et app thérapeute mobile, face à une ergonomie Booker plus ancienne.",
        "FR/EN, support et hébergement européens (RGPD).",
        "Tarification transparente plutôt qu'une grille commerciale héritée de Mindbody.",
      ],
      competitorStrengths: [
        "Solution établie avec de nombreuses années sur le marché spa/salon.",
        "Fonctionnalités matures de gestion de salon et de retail.",
        "Adossé à l'écosystème et au support de Mindbody.",
      ],
      faq: [
        {
          q: "Quelle est la différence entre Saoma et Booker (SpaBooker) ?",
          a: "Saoma est une plateforme moderne pour le spa hôtelier avec intégration PMS, app thérapeute mobile et interface FR/EN, tandis que Booker est un outil de réservation spa/salon plus ancien, centré USA et désormais intégré à Mindbody, sans intégration PMS hôtelier.",
        },
        {
          q: "Booker propose-t-il un room charge vers le PMS de l'hôtel ?",
          a: "Non, Booker n'est pas conçu pour le spa hôtelier. Saoma permet le room charge via une intégration native Opera Cloud et Mews.",
        },
        {
          q: "Booker est-il adapté à un spa européen ?",
          a: "Booker est centré sur le marché nord-américain. Pour l'Europe, Saoma offre une interface FR/EN, un support européen et un hébergement UE conforme au RGPD.",
        },
      ],
    },
    en: {
      tagline: "Spa & salon booking software, now part of the Mindbody ecosystem",
      bestFor: "North American spas and salons looking for an established booking tool.",
      summary:
        "Booker (formerly SpaBooker) is a long-standing spa and salon booking solution, now part of Mindbody. It is proven but has an aging interface, is US-centric and has no hotel PMS integration. Saoma offers a modern, mobile, hotel-oriented experience in FR/EN.",
      saomaAdvantages: [
        "Native hotel PMS integration (Opera Cloud, Mews) that Booker lacks.",
        "Modern interface and therapist mobile app, versus Booker's older UX.",
        "FR/EN, European support and hosting (GDPR).",
        "Transparent pricing rather than a sales grid inherited from Mindbody.",
      ],
      competitorStrengths: [
        "Established solution with many years in the spa/salon market.",
        "Mature salon management and retail features.",
        "Backed by the Mindbody ecosystem and support.",
      ],
      faq: [
        {
          q: "What's the difference between Saoma and Booker (SpaBooker)?",
          a: "Saoma is a modern hotel-spa platform with PMS integration, a therapist mobile app and an FR/EN interface, while Booker is an older spa/salon booking tool, US-centric and now part of Mindbody, with no hotel PMS integration.",
        },
        {
          q: "Does Booker support room charge to the hotel PMS?",
          a: "No, Booker is not built for hotel spas. Saoma enables room charge through native Opera Cloud and Mews integration.",
        },
        {
          q: "Is Booker suitable for a European spa?",
          a: "Booker is focused on North America. For Europe, Saoma offers an FR/EN interface, European support and GDPR-compliant EU hosting.",
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
      pmsHotel: "partial",
      emailToBookingAi: "no",
      advancedCustomization: "partial",
      therapistApp: "partial",
      clientBooking: "yes",
      unifiedAgenda: "yes",
      payments: "yes",
      giftCards: "yes",
      autoInvoicing: "partial",
      notifications: "yes",
      apiAccess: "yes",
      staycationIntegration: "no",
      multilingual: "partial",
      euCompliance: "partial",
      transparentPricing: "no",
    },
    fr: {
      tagline: "Plateforme entreprise pour spas, medspas et chaînes wellness",
      bestFor: "Chaînes de spas et medspas multi-sites avec des besoins opérationnels complexes.",
      summary:
        "Zenoti est une plateforme entreprise riche en fonctionnalités, populaire chez les chaînes de spas et medspas. Très complète, elle s'accompagne d'une tarification sur devis, d'une mise en œuvre conséquente et d'une courbe d'apprentissage. Saoma offre une alternative plus légère et spécialisée sur le spa hôtelier, à prix transparent.",
      saomaAdvantages: [
        "Intégration native Opera Cloud et Mews avec room charge, là où Zenoti reste généraliste wellness.",
        "Déploiement rapide et interface épurée plutôt qu'un projet entreprise lourd.",
        "Tarification transparente, sans devis ni paliers commerciaux.",
        "App thérapeute mobile pensée pour le terrain et les reversements Stripe Connect.",
      ],
      competitorStrengths: [
        "Suite très complète (CRM, marketing, inventaire, IA) pour les grandes chaînes.",
        "Solide pour les opérations medspa et multi-sites internationales.",
        "Automatisations marketing et reporting avancés.",
      ],
      faq: [
        {
          q: "Saoma est-il une alternative plus simple à Zenoti ?",
          a: "Oui. Zenoti est une suite entreprise très complète mais lourde à déployer ; Saoma propose une alternative plus légère, spécialisée sur le spa hôtelier, avec intégration PMS, app thérapeute et tarif transparent.",
        },
        {
          q: "Zenoti s'intègre-t-il aux PMS hôteliers ?",
          a: "Zenoti propose certaines intégrations mais reste une plateforme wellness généraliste. Saoma met l'accent sur une intégration native Opera Cloud et Mews avec room charge pour le spa hôtelier.",
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
        "Zenoti is a feature-rich enterprise platform popular with spa and medspa chains. Very complete, it comes with quote-based pricing, a substantial implementation and a learning curve. Saoma offers a lighter alternative specialized in hotel spas, with transparent pricing.",
      saomaAdvantages: [
        "Native Opera Cloud and Mews integration with room charge, where Zenoti remains generalist wellness.",
        "Fast deployment and a clean interface rather than a heavy enterprise project.",
        "Transparent pricing, no quotes or sales tiers.",
        "Therapist mobile app built for the field and Stripe Connect payouts.",
      ],
      competitorStrengths: [
        "Very complete suite (CRM, marketing, inventory, AI) for large chains.",
        "Strong for medspa operations and international multi-site setups.",
        "Advanced marketing automation and reporting.",
      ],
      faq: [
        {
          q: "Is Saoma a simpler alternative to Zenoti?",
          a: "Yes. Zenoti is a very complete enterprise suite but heavy to deploy; Saoma offers a lighter alternative specialized in hotel spas, with PMS integration, a therapist app and transparent pricing.",
        },
        {
          q: "Does Zenoti integrate with hotel PMS?",
          a: "Zenoti offers some integrations but remains a generalist wellness platform. Saoma focuses on native Opera Cloud and Mews integration with room charge for hotel spas.",
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
      pmsHotel: "no",
      emailToBookingAi: "no",
      advancedCustomization: "partial",
      therapistApp: "partial",
      clientBooking: "yes",
      unifiedAgenda: "yes",
      payments: "yes",
      giftCards: "yes",
      autoInvoicing: "no",
      notifications: "yes",
      apiAccess: "no",
      staycationIntegration: "no",
      multilingual: "partial",
      euCompliance: "yes",
      transparentPricing: "partial",
    },
    fr: {
      tagline: "Logiciel de réservation salon & beauté à modèle gratuit + commissions",
      bestFor: "Salons de beauté, barbiers et indépendants cherchant un outil gratuit avec place de marché.",
      summary:
        "Fresha est très populaire auprès des salons de beauté grâce à son logiciel gratuit financé par des commissions sur les nouveaux clients et des frais de paiement. Il est centré sur la beauté grand public, sans intégration PMS hôtelier ni facturation B2B hôtel/thérapeute. Saoma est conçu pour le spa hôtelier et son modèle opérationnel.",
      saomaAdvantages: [
        "Intégration PMS hôtelier (Opera Cloud, Mews) et room charge, hors du périmètre de Fresha.",
        "Facturation automatique hôtel et thérapeute, et reversements Stripe Connect.",
        "Pas de commission sur les réservations : un tarif transparent et prévisible.",
        "Parcours invité d'hôtel (QR, sans compte) et agenda multi-lieux/salles.",
      ],
      competitorStrengths: [
        "Logiciel de base gratuit, très accessible pour démarrer.",
        "Place de marché grand public qui peut amener de nouveaux clients.",
        "Très simple à prendre en main pour un salon indépendant.",
      ],
      faq: [
        {
          q: "Saoma est-il une alternative à Fresha pour un spa ?",
          a: "Oui, pour un spa d'hôtel. Fresha cible la beauté grand public avec un modèle gratuit + commissions ; Saoma se concentre sur le spa hôtelier avec intégration PMS, facturation B2B et un tarif transparent sans commission sur les réservations.",
        },
        {
          q: "Fresha est-il vraiment gratuit ?",
          a: "Le logiciel de base de Fresha est gratuit, mais il se rémunère via des commissions sur les nouveaux clients de la place de marché et des frais de paiement. Saoma applique un abonnement transparent sans commission sur les réservations.",
        },
        {
          q: "Fresha gère-t-il le spa d'un hôtel ?",
          a: "Fresha n'est pas pensé pour l'hôtellerie : pas d'intégration PMS ni de room charge. Saoma intègre nativement Opera Cloud et Mews pour le spa hôtelier.",
        },
      ],
    },
    en: {
      tagline: "Salon & beauty booking software on a free + commission model",
      bestFor: "Beauty salons, barbers and independents wanting a free tool with a marketplace.",
      summary:
        "Fresha is very popular with beauty salons thanks to its free software funded by new-client commissions and payment fees. It is consumer beauty–focused, with no hotel PMS integration and no B2B hotel/therapist invoicing. Saoma is built for the hotel spa and its operating model.",
      saomaAdvantages: [
        "Hotel PMS integration (Opera Cloud, Mews) and room charge, outside Fresha's scope.",
        "Automatic hotel and therapist invoicing, and Stripe Connect payouts.",
        "No commission on bookings: transparent, predictable pricing.",
        "Hotel guest journey (QR, no account) and multi-venue/room agenda.",
      ],
      competitorStrengths: [
        "Free base software, very accessible to get started.",
        "Consumer marketplace that can bring in new clients.",
        "Very easy to pick up for an independent salon.",
      ],
      faq: [
        {
          q: "Is Saoma an alternative to Fresha for a spa?",
          a: "Yes, for a hotel spa. Fresha targets consumer beauty with a free + commission model; Saoma focuses on hotel spas with PMS integration, B2B invoicing and transparent pricing with no booking commission.",
        },
        {
          q: "Is Fresha really free?",
          a: "Fresha's base software is free, but it earns through marketplace new-client commissions and payment fees. Saoma uses a transparent subscription with no commission on bookings.",
        },
        {
          q: "Does Fresha handle a hotel spa?",
          a: "Fresha is not built for hospitality: no PMS integration or room charge. Saoma integrates natively with Opera Cloud and Mews for hotel spas.",
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
      pmsHotel: "no",
      emailToBookingAi: "no",
      advancedCustomization: "no",
      therapistApp: "partial",
      clientBooking: "yes",
      unifiedAgenda: "yes",
      payments: "yes",
      giftCards: "yes",
      autoInvoicing: "no",
      notifications: "yes",
      apiAccess: "no",
      staycationIntegration: "no",
      multilingual: "yes",
      euCompliance: "yes",
      transparentPricing: "no",
    },
    fr: {
      tagline: "Place de marché beauté/bien-être européenne + logiciel pro (Treatwell Pro)",
      bestFor: "Salons et instituts européens cherchant l'acquisition client via une place de marché.",
      summary:
        "Treatwell est une place de marché beauté et bien-être grand public en Europe, doublée d'un logiciel de gestion (Treatwell Pro). Son intérêt principal est l'acquisition de clients via la marketplace, contre commission. Il n'est pas conçu pour le spa hôtelier ni l'intégration PMS. Saoma se concentre sur l'exploitation du spa d'hôtel plutôt que sur l'acquisition marketplace.",
      saomaAdvantages: [
        "Intégration PMS hôtelier (Opera Cloud, Mews) et room charge, absente de Treatwell.",
        "Pas de commission marketplace sur les réservations : tarif d'abonnement transparent.",
        "Facturation automatique hôtel/thérapeute et app thérapeute mobile.",
        "Maîtrise de la relation client de l'hôtel, sans intermédiation par une place de marché.",
      ],
      competitorStrengths: [
        "Forte place de marché grand public en Europe pour générer des réservations.",
        "Bonne visibilité et acquisition de nouveaux clients beauté/bien-être.",
        "Présence multi-pays et multilingue en Europe.",
      ],
      faq: [
        {
          q: "Saoma est-il une alternative à Treatwell pour un spa ?",
          a: "Pour un spa d'hôtel, oui. Treatwell est avant tout une place de marché d'acquisition avec commissions ; Saoma est un logiciel d'exploitation du spa hôtelier avec intégration PMS, facturation B2B et tarif transparent.",
        },
        {
          q: "Treatwell prélève-t-il une commission ?",
          a: "Le modèle de Treatwell repose sur des commissions sur les réservations issues de la place de marché. Saoma fonctionne par abonnement transparent, sans commission sur les réservations.",
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
        "Treatwell is a consumer beauty and wellness marketplace in Europe, paired with management software (Treatwell Pro). Its main value is client acquisition through the marketplace, in exchange for commission. It is not built for hotel spas or PMS integration. Saoma focuses on running the hotel spa rather than marketplace acquisition.",
      saomaAdvantages: [
        "Hotel PMS integration (Opera Cloud, Mews) and room charge, absent from Treatwell.",
        "No marketplace commission on bookings: transparent subscription pricing.",
        "Automatic hotel/therapist invoicing and a therapist mobile app.",
        "You own the hotel's client relationship, with no marketplace intermediation.",
      ],
      competitorStrengths: [
        "Strong consumer marketplace in Europe to generate bookings.",
        "Good visibility and acquisition of new beauty/wellness clients.",
        "Multi-country, multilingual presence across Europe.",
      ],
      faq: [
        {
          q: "Is Saoma an alternative to Treatwell for a spa?",
          a: "For a hotel spa, yes. Treatwell is primarily an acquisition marketplace with commissions; Saoma is operational software for the hotel spa with PMS integration, B2B invoicing and transparent pricing.",
        },
        {
          q: "Does Treatwell charge a commission?",
          a: "Treatwell's model is based on commissions on bookings coming from the marketplace. Saoma works on a transparent subscription, with no commission on bookings.",
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
