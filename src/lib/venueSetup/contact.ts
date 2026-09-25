import { BRAND_EMAIL } from "@/components/landing/constants";

/** mailto link to the Saoma team, with the venue in the subject. */
export function contactHref(label?: string): string {
  const subject = label ? `Onboarding — ${label}` : "Onboarding";
  return `mailto:${BRAND_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
