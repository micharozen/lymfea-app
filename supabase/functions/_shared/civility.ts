// Civility (title) helper shared across edge functions.
//
// The customer's civility is stored as a key ('madame' | 'monsieur') on the
// customers table; emails/SMS derive a localised label from it to personalise
// greetings ("Madame Dupont" / "Mrs Dupont").

export type Civility = 'madame' | 'monsieur';

const LABELS: Record<Civility, { fr: string; en: string }> = {
  madame: { fr: 'Madame', en: 'Mrs' },
  monsieur: { fr: 'Monsieur', en: 'Mr' },
};

/**
 * Returns the localised civility label, or null when no/unknown civility is set.
 */
export function civilityLabel(
  civility: string | null | undefined,
  lang: 'fr' | 'en',
): string | null {
  if (civility === 'madame' || civility === 'monsieur') {
    return LABELS[civility][lang];
  }
  return null;
}
