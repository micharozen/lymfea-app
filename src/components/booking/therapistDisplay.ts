/** Affichage d'un thérapeute, partagé par les vues planning. */

/** « Marie D. » */
export function shortName(firstName: string, lastName: string | null): string {
  const last = (lastName ?? "").trim();
  return last ? `${firstName} ${last[0].toUpperCase()}.` : firstName;
}

export function initials(firstName: string, lastName: string | null): string {
  return `${firstName[0] ?? ""}${(lastName ?? "")[0] ?? ""}`.toUpperCase();
}
