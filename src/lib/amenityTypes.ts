import { Waves, Dumbbell, Flame, Cloud, Bath, type LucideIcon } from "lucide-react";

export interface AmenityTypeDefinition {
  key: string;
  labelFr: string;
  labelEn: string;
  icon: LucideIcon;
  defaultColor: string;
}

export const AMENITY_TYPES: readonly AmenityTypeDefinition[] = [
  { key: "pool", labelFr: "Piscine", labelEn: "Pool", icon: Waves, defaultColor: "#06b6d4" },
  { key: "fitness", labelFr: "Salle de fitness", labelEn: "Fitness Room", icon: Dumbbell, defaultColor: "#84cc16" },
  { key: "sauna", labelFr: "Sauna", labelEn: "Sauna", icon: Flame, defaultColor: "#f97316" },
  { key: "hammam", labelFr: "Hammam", labelEn: "Hammam", icon: Cloud, defaultColor: "#8b5cf6" },
  { key: "jacuzzi", labelFr: "Jacuzzi", labelEn: "Jacuzzi", icon: Bath, defaultColor: "#ec4899" },
] as const;

export function getAmenityType(key: string): AmenityTypeDefinition | undefined {
  return AMENITY_TYPES.find((t) => t.key === key);
}

export function getAmenityLabel(key: string, locale: string): string {
  const type = getAmenityType(key);
  if (!type) return key;
  return locale === "fr" ? type.labelFr : type.labelEn;
}

export function getAmenityIcon(key: string): LucideIcon | undefined {
  return getAmenityType(key)?.icon;
}

export function getAmenityDefaultColor(key: string): string {
  return getAmenityType(key)?.defaultColor ?? "#3b82f6";
}

export const CLIENT_TYPES = ["external", "internal", "lymfea"] as const;
export type AmenityClientType = (typeof CLIENT_TYPES)[number];

export function getClientTypeLabel(clientType: AmenityClientType, locale: string): string {
  const labels: Record<AmenityClientType, { fr: string; en: string }> = {
    external: { fr: "Externe", en: "External" },
    internal: { fr: "Interne (hôtel)", en: "Internal (hotel)" },
    lymfea: { fr: "Eïa (soin)", en: "Eïa (treatment)" },
  };
  return locale === "fr" ? labels[clientType].fr : labels[clientType].en;
}
