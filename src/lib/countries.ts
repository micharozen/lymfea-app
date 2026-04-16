export interface Country {
  code: string;
  label: string;
  flag: string;
}

export const countries: Country[] = [
  { code: "+33", label: "France", flag: "FR" },
  { code: "+971", label: "UAE", flag: "AE" },
  { code: "+1", label: "USA", flag: "US" },
  { code: "+44", label: "UK", flag: "GB" },
  { code: "+49", label: "Germany", flag: "DE" },
  { code: "+39", label: "Italy", flag: "IT" },
  { code: "+34", label: "Spain", flag: "ES" },
  { code: "+41", label: "Switzerland", flag: "CH" },
  { code: "+32", label: "Belgium", flag: "BE" },
  { code: "+377", label: "Monaco", flag: "MC" },
  { code: "+31", label: "Netherlands", flag: "NL" },
  { code: "+351", label: "Portugal", flag: "PT" },
  { code: "+43", label: "Austria", flag: "AT" },
  { code: "+46", label: "Sweden", flag: "SE" },
  { code: "+47", label: "Norway", flag: "NO" },
  { code: "+45", label: "Denmark", flag: "DK" },
  { code: "+358", label: "Finland", flag: "FI" },
  { code: "+48", label: "Poland", flag: "PL" },
  { code: "+420", label: "Czech Republic", flag: "CZ" },
  { code: "+30", label: "Greece", flag: "GR" },
  { code: "+353", label: "Ireland", flag: "IE" },
  { code: "+352", label: "Luxembourg", flag: "LU" },
  { code: "+36", label: "Hungary", flag: "HU" },
  { code: "+40", label: "Romania", flag: "RO" },
  { code: "+385", label: "Croatia", flag: "HR" },
  { code: "+7", label: "Russia", flag: "RU" },
  { code: "+81", label: "Japan", flag: "JP" },
  { code: "+86", label: "China", flag: "CN" },
  { code: "+82", label: "South Korea", flag: "KR" },
  { code: "+91", label: "India", flag: "IN" },
  { code: "+55", label: "Brazil", flag: "BR" },
  { code: "+52", label: "Mexico", flag: "MX" },
  { code: "+61", label: "Australia", flag: "AU" },
  { code: "+64", label: "New Zealand", flag: "NZ" },
  { code: "+65", label: "Singapore", flag: "SG" },
  { code: "+852", label: "Hong Kong", flag: "HK" },
  { code: "+966", label: "Saudi Arabia", flag: "SA" },
  { code: "+974", label: "Qatar", flag: "QA" },
  { code: "+212", label: "Morocco", flag: "MA" },
  { code: "+216", label: "Tunisia", flag: "TN" },
  { code: "+27", label: "South Africa", flag: "ZA" },
  { code: "+90", label: "Turkey", flag: "TR" },
  { code: "+972", label: "Israel", flag: "IL" },
  { code: "+62", label: "Indonesia", flag: "ID" },
  { code: "+66", label: "Thailand", flag: "TH" },
  { code: "+60", label: "Malaysia", flag: "MY" },
];

/** Convert ISO 3166-1 alpha-2 code to emoji flag (e.g. "FR" → "🇫🇷") */
export function flagEmoji(iso: string): string {
  return [...iso.toUpperCase()].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join("");
}
