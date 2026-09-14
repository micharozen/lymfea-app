/**
 * Normalisation des références de bons cadeaux revendeurs.
 *
 * Les codes Wonderbox, Smartbox ou Groupon circulent sous des formes variables :
 * le client recopie ce qu'il lit sur son coffret, avec ou sans tirets, espaces
 * ou minuscules. La forme normalisée est la clé de recherche (colonne
 * `external_code_normalized`), tandis que `external_code` conserve la saisie
 * d'origine pour l'affichage.
 *
 * Le même traitement doit être appliqué à la saisie backoffice et à la saisie
 * client, sans quoi un bon enregistré ne serait pas retrouvé.
 */
export function normalizeVoucherCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** Longueur minimale d'une référence exploitable, alignée sur la RPC de recherche. */
export const MIN_VOUCHER_CODE_LENGTH = 4;

/** Une référence est exploitable dès qu'elle porte assez de caractères significatifs. */
export function isUsableVoucherCode(code: string): boolean {
  return normalizeVoucherCode(code).length >= MIN_VOUCHER_CODE_LENGTH;
}
