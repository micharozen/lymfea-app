/**
 * Email normalization + validation for booking creation.
 *
 * Motivation (prod #1010): an operator typed an accented address
 * ("véronique.karcenty@orange.fr"). A non-ASCII local part is invalid for
 * standard SMTP, so Resend silently rejected it — the confirmation email never
 * left and no audit row was written. We strip diacritics (the only deliverable
 * interpretation of an accented address) and validate the result before it
 * reaches the database.
 */

// Pragmatic ASCII email check: single @, non-empty ASCII local part, a domain
// with at least one dot. Not RFC-exhaustive — just enough to reject addresses
// Resend cannot deliver.
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

/**
 * Trim, lowercase and strip diacritics (é → e). Returns null for empty input so
 * callers can treat "no email" and "blank email" the same way.
 */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return trimmed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** True when the (already normalized) string is a plausible, ASCII-only email. */
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}
