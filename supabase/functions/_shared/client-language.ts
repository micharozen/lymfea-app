export type ClientLanguage = "fr" | "en";

function isClientLanguage(value: unknown): value is ClientLanguage {
  return value === "fr" || value === "en";
}

/**
 * Langue de communication client, pour tout envoi destiné au client
 * (e-mail, SMS, WhatsApp).
 *
 * `customers.language` fait foi : c'est la préférence durable du client,
 * partagée par toutes ses réservations. `bookings.language` n'est qu'une
 * dérivation par réservation (indicatif téléphonique au moment de la
 * création) qu'un chemin de création peut laisser à sa valeur par défaut —
 * il ne sert donc que de repli quand le client n'a pas de fiche customer.
 */
export function resolveClientLanguage(
  customerLanguage?: string | null,
  bookingLanguage?: string | null,
): ClientLanguage {
  if (isClientLanguage(customerLanguage)) return customerLanguage;
  if (isClientLanguage(bookingLanguage)) return bookingLanguage;
  return "fr";
}
