/**
 * Miroir Deno de `src/lib/voucherCode.ts`.
 *
 * Le code d'un bon revendeur est saisi à trois endroits — backoffice, parcours
 * client, edge function — et doit produire la même clé de recherche partout,
 * sinon un bon enregistré avec des tirets reste introuvable. Les edge functions
 * ne pouvant pas importer `src/`, la règle est dupliquée ici, comme
 * `cancel-booking-rules.ts` duplique `src/lib/cancelBookingRules.ts`.
 */
export function normalizeVoucherCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** Longueur minimale d'une référence exploitable, alignée sur la RPC de recherche. */
export const MIN_VOUCHER_CODE_LENGTH = 4;
