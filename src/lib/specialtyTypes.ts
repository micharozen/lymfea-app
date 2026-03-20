export interface SpecialtyDefinition {
  key: string;
  labelFr: string;
  labelEn: string;
}

export const SPECIALTY_OPTIONS: readonly SpecialtyDefinition[] = [
  { key: "relaxing_massage", labelFr: "Massage relaxant", labelEn: "Relaxing Massage" },
  { key: "deep_tissue", labelFr: "Massage deep tissue", labelEn: "Deep Tissue Massage" },
  { key: "hot_stones", labelFr: "Massage pierres chaudes", labelEn: "Hot Stones Massage" },
  { key: "aromatherapy", labelFr: "Aromathérapie", labelEn: "Aromatherapy" },
  { key: "prenatal_massage", labelFr: "Massage prénatal", labelEn: "Prenatal Massage" },
  { key: "sports_massage", labelFr: "Massage sportif", labelEn: "Sports Massage" },
  { key: "facial", labelFr: "Soin du visage", labelEn: "Facial Treatment" },
  { key: "body_treatment", labelFr: "Soin du corps", labelEn: "Body Treatment" },
  { key: "body_scrub", labelFr: "Gommage corporel", labelEn: "Body Scrub" },
  { key: "body_wrap", labelFr: "Enveloppement", labelEn: "Body Wrap" },
  { key: "manicure_pedicure", labelFr: "Manucure & Pédicure", labelEn: "Manicure & Pedicure" },
  { key: "hair_removal", labelFr: "Épilation", labelEn: "Hair Removal" },
  { key: "hydrotherapy", labelFr: "Hydrothérapie", labelEn: "Hydrotherapy" },
  { key: "reflexology", labelFr: "Réflexologie", labelEn: "Reflexology" },
  { key: "ayurveda", labelFr: "Ayurvéda", labelEn: "Ayurveda" },
] as const;

export function getSpecialtyLabel(key: string, locale: string): string {
  const option = SPECIALTY_OPTIONS.find((o) => o.key === key);
  if (!option) return key;
  return locale === "fr" ? option.labelFr : option.labelEn;
}

export function getSpecialtySelectOptions(locale: string) {
  return SPECIALTY_OPTIONS.map((s) => ({
    value: s.key,
    label: locale === "fr" ? s.labelFr : s.labelEn,
  }));
}
