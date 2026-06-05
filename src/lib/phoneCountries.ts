export interface PhoneCountry {
  code: string;
  label: string;
  flag: string;
  pattern: RegExp;
  placeholder: string;
}

export const phoneCountries: PhoneCountry[] = [
  { code: "+33", label: "France", flag: "FR", pattern: /^[1-9]\d{8}$/, placeholder: "6 12 34 56 78" },
  { code: "+971", label: "UAE", flag: "AE", pattern: /^\d{9}$/, placeholder: "50 123 4567" },
  { code: "+1", label: "USA", flag: "US", pattern: /^\d{10}$/, placeholder: "555 123 4567" },
  { code: "+44", label: "UK", flag: "GB", pattern: /^[1-9]\d{9}$/, placeholder: "7911 123456" },
  { code: "+49", label: "Germany", flag: "DE", pattern: /^\d{10,11}$/, placeholder: "151 234 56789" },
  { code: "+39", label: "Italy", flag: "IT", pattern: /^\d{9,11}$/, placeholder: "333 123 4567" },
  { code: "+34", label: "Spain", flag: "ES", pattern: /^\d{9}$/, placeholder: "612 345 678" },
  { code: "+41", label: "Switzerland", flag: "CH", pattern: /^\d{9}$/, placeholder: "79 123 45 67" },
  { code: "+32", label: "Belgium", flag: "BE", pattern: /^\d{8,9}$/, placeholder: "498 12 34 56" },
  { code: "+377", label: "Monaco", flag: "MC", pattern: /^\d{8}$/, placeholder: "06 12 34 56" },
  { code: "+31", label: "Netherlands", flag: "NL", pattern: /^\d{9}$/, placeholder: "6 12 34 56 78" },
  { code: "+351", label: "Portugal", flag: "PT", pattern: /^\d{9}$/, placeholder: "912 345 678" },
  { code: "+43", label: "Austria", flag: "AT", pattern: /^\d{10,11}$/, placeholder: "664 123 4567" },
  { code: "+46", label: "Sweden", flag: "SE", pattern: /^\d{9}$/, placeholder: "70 123 45 67" },
  { code: "+47", label: "Norway", flag: "NO", pattern: /^\d{8}$/, placeholder: "412 34 567" },
  { code: "+45", label: "Denmark", flag: "DK", pattern: /^\d{8}$/, placeholder: "41 23 45 67" },
  { code: "+358", label: "Finland", flag: "FI", pattern: /^\d{8,10}$/, placeholder: "41 234 5678" },
  { code: "+48", label: "Poland", flag: "PL", pattern: /^\d{9}$/, placeholder: "512 345 678" },
  { code: "+420", label: "Czech Republic", flag: "CZ", pattern: /^\d{9}$/, placeholder: "601 234 567" },
  { code: "+30", label: "Greece", flag: "GR", pattern: /^\d{10}$/, placeholder: "694 123 4567" },
  { code: "+353", label: "Ireland", flag: "IE", pattern: /^\d{9}$/, placeholder: "85 123 4567" },
  { code: "+352", label: "Luxembourg", flag: "LU", pattern: /^\d{8,9}$/, placeholder: "621 123 456" },
  { code: "+36", label: "Hungary", flag: "HU", pattern: /^\d{9}$/, placeholder: "20 123 4567" },
  { code: "+40", label: "Romania", flag: "RO", pattern: /^\d{9}$/, placeholder: "712 345 678" },
  { code: "+385", label: "Croatia", flag: "HR", pattern: /^\d{8,9}$/, placeholder: "91 234 5678" },
  { code: "+7", label: "Russia", flag: "RU", pattern: /^\d{10}$/, placeholder: "912 345 67 89" },
  { code: "+81", label: "Japan", flag: "JP", pattern: /^\d{9,10}$/, placeholder: "90 1234 5678" },
  { code: "+86", label: "China", flag: "CN", pattern: /^\d{11}$/, placeholder: "131 2345 6789" },
  { code: "+82", label: "South Korea", flag: "KR", pattern: /^\d{9,10}$/, placeholder: "10 1234 5678" },
  { code: "+91", label: "India", flag: "IN", pattern: /^\d{10}$/, placeholder: "98765 43210" },
  { code: "+55", label: "Brazil", flag: "BR", pattern: /^\d{10,11}$/, placeholder: "11 91234 5678" },
  { code: "+52", label: "Mexico", flag: "MX", pattern: /^\d{10}$/, placeholder: "55 1234 5678" },
  { code: "+61", label: "Australia", flag: "AU", pattern: /^\d{9}$/, placeholder: "412 345 678" },
  { code: "+64", label: "New Zealand", flag: "NZ", pattern: /^\d{8,9}$/, placeholder: "21 234 5678" },
  { code: "+65", label: "Singapore", flag: "SG", pattern: /^\d{8}$/, placeholder: "8123 4567" },
  { code: "+852", label: "Hong Kong", flag: "HK", pattern: /^\d{8}$/, placeholder: "9123 4567" },
  { code: "+966", label: "Saudi Arabia", flag: "SA", pattern: /^\d{9}$/, placeholder: "51 234 5678" },
  { code: "+974", label: "Qatar", flag: "QA", pattern: /^\d{8}$/, placeholder: "3312 3456" },
  { code: "+212", label: "Morocco", flag: "MA", pattern: /^\d{9}$/, placeholder: "6 12 34 56 78" },
  { code: "+216", label: "Tunisia", flag: "TN", pattern: /^\d{8}$/, placeholder: "20 123 456" },
  { code: "+27", label: "South Africa", flag: "ZA", pattern: /^\d{9}$/, placeholder: "71 234 5678" },
  { code: "+90", label: "Turkey", flag: "TR", pattern: /^\d{10}$/, placeholder: "512 345 67 89" },
  { code: "+972", label: "Israel", flag: "IL", pattern: /^\d{9}$/, placeholder: "50 123 4567" },
  { code: "+62", label: "Indonesia", flag: "ID", pattern: /^\d{9,11}$/, placeholder: "812 3456 789" },
  { code: "+66", label: "Thailand", flag: "TH", pattern: /^\d{9}$/, placeholder: "81 234 5678" },
  { code: "+60", label: "Malaysia", flag: "MY", pattern: /^\d{9,10}$/, placeholder: "12 345 6789" },
];

export const toFlagEmoji = (isoCode: string): string =>
  [...isoCode.toUpperCase()]
    .map((c) => String.fromCodePoint(c.charCodeAt(0) + 127397))
    .join("");
