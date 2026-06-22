export interface CountryOption {
  code: string;
  label: string;
  flag: string;
}

export const countries: CountryOption[] = [
  { code: "+27", label: "Afrique du Sud", flag: "🇿🇦" },
  { code: "+49", label: "Allemagne", flag: "🇩🇪" },
  { code: "+966", label: "Arabie Saoudite", flag: "🇸🇦" },
  { code: "+54", label: "Argentine", flag: "🇦🇷" },
  { code: "+61", label: "Australie", flag: "🇦🇺" },
  { code: "+43", label: "Autriche", flag: "🇦🇹" },
  { code: "+32", label: "Belgique", flag: "🇧🇪" },
  { code: "+55", label: "Brésil", flag: "🇧🇷" },
  { code: "+86", label: "Chine", flag: "🇨🇳" },
  { code: "+82", label: "Corée du Sud", flag: "🇰🇷" },
  { code: "+45", label: "Danemark", flag: "🇩🇰" },
  { code: "+971", label: "EAU", flag: "🇦🇪" },
  { code: "+20", label: "Égypte", flag: "🇪🇬" },
  { code: "+34", label: "Espagne", flag: "🇪🇸" },
  { code: "+1", label: "États-Unis", flag: "🇺🇸" },
  { code: "+358", label: "Finlande", flag: "🇫🇮" },
  { code: "+33", label: "France", flag: "🇫🇷" },
  { code: "+30", label: "Grèce", flag: "🇬🇷" },
  { code: "+36", label: "Hongrie", flag: "🇭🇺" },
  { code: "+91", label: "Inde", flag: "🇮🇳" },
  { code: "+62", label: "Indonésie", flag: "🇮🇩" },
  { code: "+353", label: "Irlande", flag: "🇮🇪" },
  { code: "+972", label: "Israël", flag: "🇮🇱" },
  { code: "+39", label: "Italie", flag: "🇮🇹" },
  { code: "+81", label: "Japon", flag: "🇯🇵" },
  { code: "+965", label: "Koweït", flag: "🇰🇼" },
  { code: "+352", label: "Luxembourg", flag: "🇱🇺" },
  { code: "+60", label: "Malaisie", flag: "🇲🇾" },
  { code: "+212", label: "Maroc", flag: "🇲🇦" },
  { code: "+52", label: "Mexique", flag: "🇲🇽" },
  { code: "+377", label: "Monaco", flag: "🇲🇨" },
  { code: "+47", label: "Norvège", flag: "🇳🇴" },
  { code: "+64", label: "Nouvelle-Zélande", flag: "🇳🇿" },
  { code: "+31", label: "Pays-Bas", flag: "🇳🇱" },
  { code: "+63", label: "Philippines", flag: "🇵🇭" },
  { code: "+48", label: "Pologne", flag: "🇵🇱" },
  { code: "+351", label: "Portugal", flag: "🇵🇹" },
  { code: "+974", label: "Qatar", flag: "🇶🇦" },
  { code: "+44", label: "Royaume-Uni", flag: "🇬🇧" },
  { code: "+7", label: "Russie", flag: "🇷🇺" },
  { code: "+65", label: "Singapour", flag: "🇸🇬" },
  { code: "+46", label: "Suède", flag: "🇸🇪" },
  { code: "+41", label: "Suisse", flag: "🇨🇭" },
  { code: "+420", label: "Tchéquie", flag: "🇨🇿" },
  { code: "+66", label: "Thaïlande", flag: "🇹🇭" },
  { code: "+216", label: "Tunisie", flag: "🇹🇳" },
  { code: "+90", label: "Turquie", flag: "🇹🇷" },
  { code: "+84", label: "Vietnam", flag: "🇻🇳" },
];

/**
 * Combine un indicatif pays et un numéro saisi en un seul numéro normalisé.
 *
 * Si le numéro saisi commence déjà par "+", il est considéré comme étant
 * au format international complet et l'indicatif n'est PAS ajouté — cela
 * évite les doublons type "+33 +336090134" quand l'utilisateur colle un
 * numéro avec son indicatif. Sinon, l'indicatif est préfixé avec un espace.
 */
export const composePhoneNumber = (countryCode: string, phone: string): string => {
  const trimmed = (phone ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return trimmed;
  return `${countryCode} ${trimmed}`;
};

/**
 * Normalise un numéro vers la forme canonique stockée dans `therapists.phone`.
 *
 * La DB impose `CHECK (phone IS NULL OR phone ~ '^[1-9][0-9]+$')`
 * (migration 20260606210000_renormalize_therapist_phones.sql) : chiffres
 * uniquement, sans 0 initial (l'indicatif est stocké à part). Tout autre
 * format (espaces, 0 initial, "+", ".", "-") provoque une violation 23514.
 *
 * Retire tout caractère non numérique puis tous les zéros initiaux. Renvoie
 * null s'il ne reste rien d'exploitable (la branche NULL du CHECK s'applique).
 */
export const normalizeTherapistPhone = (raw: string): string | null => {
  const digits = (raw ?? "").replace(/[^0-9]/g, "").replace(/^0+/, "");
  return digits.length >= 2 ? digits : null;
};

export const formatPhoneNumber = (value: string, countryCode: string): string => {
  const numbers = value.replace(/\D/g, '');
  switch (countryCode) {
    case "+33":
      const fr = numbers.slice(0, 10);
      if (fr.length <= 1) return fr;
      if (fr.length <= 3) return `${fr.slice(0, 1)} ${fr.slice(1)}`;
      if (fr.length <= 5) return `${fr.slice(0, 1)} ${fr.slice(1, 3)} ${fr.slice(3)}`;
      if (fr.length <= 7) return `${fr.slice(0, 1)} ${fr.slice(1, 3)} ${fr.slice(3, 5)} ${fr.slice(5)}`;
      if (fr.length <= 9) return `${fr.slice(0, 1)} ${fr.slice(1, 3)} ${fr.slice(3, 5)} ${fr.slice(5, 7)} ${fr.slice(7)}`;
      return `${fr.slice(0, 1)} ${fr.slice(1, 3)} ${fr.slice(3, 5)} ${fr.slice(5, 7)} ${fr.slice(7, 9)} ${fr.slice(9, 10)}`;
    case "+971":
      const uae = numbers.slice(0, 9);
      if (uae.length <= 1) return uae;
      if (uae.length <= 4) return `${uae.slice(0, 1)} ${uae.slice(1)}`;
      if (uae.length <= 7) return `${uae.slice(0, 1)} ${uae.slice(1, 4)} ${uae.slice(4)}`;
      return `${uae.slice(0, 1)} ${uae.slice(1, 4)} ${uae.slice(4, 7)} ${uae.slice(7)}`;
    default:
      return numbers.slice(0, 15);
  }
};
