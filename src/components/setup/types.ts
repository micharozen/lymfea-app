import type { SetupState } from "@/lib/venueSetup/api";
import type { SectionName } from "@shared/venueSetup/spec";

export interface StepProps {
  token: string;
  state: SetupState;
  /** id of the <form>: the page footer submit button targets it. */
  formId: string;
  onSave: (sections: Partial<Record<SectionName, unknown>>) => void;
}

/** Reads one section of the stored answers as a plain object. */
export function sectionObject(state: SetupState, name: SectionName): Record<string, unknown> {
  const value = state.data[name];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function sectionList(state: SetupState, name: SectionName): Record<string, unknown>[] {
  const value = state.data[name];
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

/** String form value from a stored answer (null → ""). */
export const str = (v: unknown) => (typeof v === "string" ? v : "");
export const numOrNull = (v: unknown) => (typeof v === "number" ? v : null);
export const boolOr = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

export const COUNTRY_CODES = [
  { code: "+33", label: "🇫🇷 +33" },
  { code: "+32", label: "🇧🇪 +32" },
  { code: "+41", label: "🇨🇭 +41" },
  { code: "+377", label: "🇲🇨 +377" },
  { code: "+44", label: "🇬🇧 +44" },
  { code: "+49", label: "🇩🇪 +49" },
  { code: "+39", label: "🇮🇹 +39" },
  { code: "+34", label: "🇪🇸 +34" },
  { code: "+351", label: "🇵🇹 +351" },
  { code: "+1", label: "🇺🇸 +1" },
  { code: "+971", label: "🇦🇪 +971" },
];
