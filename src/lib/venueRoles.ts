export const VENUE_ROLES = [
  { value: "direction_hotel", labelFr: "Direction hôtel", labelEn: "Hotel Management" },
  { value: "reception", labelFr: "Réception", labelEn: "Reception" },
  { value: "conciergerie", labelFr: "Conciergerie", labelEn: "Concierge Services" },
  { value: "assistance_direction", labelFr: "Assistance de direction", labelEn: "Executive Assistant" },
] as const;

export type VenueRole = typeof VENUE_ROLES[number]["value"];
