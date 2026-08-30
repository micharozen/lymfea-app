/**
 * Paliers de durée du barème thérapeute, partagés par la carte « Finance »
 * (barème par défaut, lié à react-hook-form) et par l'éditeur de barèmes
 * spécifiques par soin (état contrôlé). Seule la liste est commune : les deux
 * surfaces n'ont pas le même mode de liaison, donc pas le même rendu de ligne.
 */
export type RateName =
  | "rate_45"
  | "rate_60"
  | "rate_75"
  | "rate_90"
  | "rate_105"
  | "rate_120"
  | "rate_150";

export interface RateBracket {
  name: RateName;
  minutes: number;
  labelKey: string;
  fallback: string;
  /** Les paliers de base sont toujours affichés et requis sur le barème par défaut. */
  base: boolean;
}

export const RATE_BRACKETS: RateBracket[] = [
  { name: "rate_45", minutes: 45, labelKey: "admin:therapists.rate45Label", fallback: "0h45", base: false },
  { name: "rate_60", minutes: 60, labelKey: "admin:therapists.rate60Label", fallback: "1h00", base: true },
  { name: "rate_75", minutes: 75, labelKey: "admin:therapists.rate75Label", fallback: "1h15", base: true },
  { name: "rate_90", minutes: 90, labelKey: "admin:therapists.rate90Label", fallback: "1h30", base: true },
  { name: "rate_105", minutes: 105, labelKey: "admin:therapists.rate105Label", fallback: "1h45", base: false },
  { name: "rate_120", minutes: 120, labelKey: "admin:therapists.rate120Label", fallback: "2h00", base: false },
  { name: "rate_150", minutes: 150, labelKey: "admin:therapists.rate150Label", fallback: "2h30", base: false },
];
