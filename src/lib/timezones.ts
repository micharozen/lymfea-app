// Timezone utilities with friendly names based on country
export interface TimezoneOption {
  value: string; // IANA timezone (e.g., 'Europe/Paris')
  label: string; // Friendly name (e.g., 'Paris, France')
  offset: string; // Current UTC offset (e.g., 'UTC+1')
}

// Country defaults for auto-suggestion (timezone, currency, VAT)
export interface CountryDefaults {
  timezone: string;
  currency: string;
  vat: number;
}

export interface CountryOption {
  value: string; // Country name (lowercase key used by getCountryDefaults)
  label: string; // Display name
}

// Country options for picklist (derived from COUNTRY_DEFAULTS, full names only)
export const COUNTRY_OPTIONS: CountryOption[] = [
  // Europe
  { value: 'france', label: 'France' },
  { value: 'germany', label: 'Allemagne' },
  { value: 'spain', label: 'Espagne' },
  { value: 'italy', label: 'Italie' },
  { value: 'netherlands', label: 'Pays-Bas' },
  { value: 'belgium', label: 'Belgique' },
  { value: 'austria', label: 'Autriche' },
  { value: 'portugal', label: 'Portugal' },
  { value: 'ireland', label: 'Irlande' },
  { value: 'greece', label: 'Grèce' },
  { value: 'finland', label: 'Finlande' },
  { value: 'monaco', label: 'Monaco' },
  { value: 'united kingdom', label: 'Royaume-Uni' },
  { value: 'switzerland', label: 'Suisse' },
  { value: 'sweden', label: 'Suède' },
  { value: 'norway', label: 'Norvège' },
  { value: 'denmark', label: 'Danemark' },
  { value: 'poland', label: 'Pologne' },
  { value: 'czech republic', label: 'République tchèque' },
  { value: 'hungary', label: 'Hongrie' },
  { value: 'romania', label: 'Roumanie' },
  { value: 'turkey', label: 'Turquie' },
  // Middle East
  { value: 'united arab emirates', label: 'Émirats arabes unis' },
  { value: 'saudi arabia', label: 'Arabie saoudite' },
  { value: 'qatar', label: 'Qatar' },
  { value: 'kuwait', label: 'Koweït' },
  { value: 'bahrain', label: 'Bahreïn' },
  { value: 'israel', label: 'Israël' },
  // Americas
  { value: 'united states', label: 'États-Unis' },
  { value: 'canada', label: 'Canada' },
  { value: 'mexico', label: 'Mexique' },
  { value: 'brazil', label: 'Brésil' },
  // Asia Pacific
  { value: 'japan', label: 'Japon' },
  { value: 'china', label: 'Chine' },
  { value: 'hong kong', label: 'Hong Kong' },
  { value: 'singapore', label: 'Singapour' },
  { value: 'australia', label: 'Australie' },
  { value: 'new zealand', label: 'Nouvelle-Zélande' },
  { value: 'india', label: 'Inde' },
  { value: 'thailand', label: 'Thaïlande' },
  // Africa
  { value: 'south africa', label: 'Afrique du Sud' },
  { value: 'morocco', label: 'Maroc' },
  { value: 'egypt', label: 'Égypte' },
  // Indian Ocean
  { value: 'maldives', label: 'Maldives' },
  { value: 'mauritius', label: 'Maurice' },
];

// Common timezones with friendly names grouped by region
export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  // Europe
  { value: 'Europe/Paris', label: 'Paris, France', offset: 'UTC+1' },
  { value: 'Europe/London', label: 'London, UK', offset: 'UTC+0' },
  { value: 'Europe/Berlin', label: 'Berlin, Germany', offset: 'UTC+1' },
  { value: 'Europe/Madrid', label: 'Madrid, Spain', offset: 'UTC+1' },
  { value: 'Europe/Rome', label: 'Rome, Italy', offset: 'UTC+1' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam, Netherlands', offset: 'UTC+1' },
  { value: 'Europe/Brussels', label: 'Brussels, Belgium', offset: 'UTC+1' },
  { value: 'Europe/Zurich', label: 'Zurich, Switzerland', offset: 'UTC+1' },
  { value: 'Europe/Vienna', label: 'Vienna, Austria', offset: 'UTC+1' },
  { value: 'Europe/Stockholm', label: 'Stockholm, Sweden', offset: 'UTC+1' },
  { value: 'Europe/Oslo', label: 'Oslo, Norway', offset: 'UTC+1' },
  { value: 'Europe/Copenhagen', label: 'Copenhagen, Denmark', offset: 'UTC+1' },
  { value: 'Europe/Helsinki', label: 'Helsinki, Finland', offset: 'UTC+2' },
  { value: 'Europe/Athens', label: 'Athens, Greece', offset: 'UTC+2' },
  { value: 'Europe/Lisbon', label: 'Lisbon, Portugal', offset: 'UTC+0' },
  { value: 'Europe/Dublin', label: 'Dublin, Ireland', offset: 'UTC+0' },
  { value: 'Europe/Warsaw', label: 'Warsaw, Poland', offset: 'UTC+1' },
  { value: 'Europe/Prague', label: 'Prague, Czech Republic', offset: 'UTC+1' },
  { value: 'Europe/Budapest', label: 'Budapest, Hungary', offset: 'UTC+1' },
  { value: 'Europe/Bucharest', label: 'Bucharest, Romania', offset: 'UTC+2' },
  { value: 'Europe/Moscow', label: 'Moscow, Russia', offset: 'UTC+3' },
  { value: 'Europe/Istanbul', label: 'Istanbul, Turkey', offset: 'UTC+3' },
  { value: 'Europe/Monaco', label: 'Monaco', offset: 'UTC+1' },
  
  // Americas
  { value: 'America/New_York', label: 'New York, USA', offset: 'UTC-5' },
  { value: 'America/Los_Angeles', label: 'Los Angeles, USA', offset: 'UTC-8' },
  { value: 'America/Chicago', label: 'Chicago, USA', offset: 'UTC-6' },
  { value: 'America/Denver', label: 'Denver, USA', offset: 'UTC-7' },
  { value: 'America/Miami', label: 'Miami, USA', offset: 'UTC-5' },
  { value: 'America/Toronto', label: 'Toronto, Canada', offset: 'UTC-5' },
  { value: 'America/Vancouver', label: 'Vancouver, Canada', offset: 'UTC-8' },
  { value: 'America/Montreal', label: 'Montreal, Canada', offset: 'UTC-5' },
  { value: 'America/Mexico_City', label: 'Mexico City, Mexico', offset: 'UTC-6' },
  { value: 'America/Sao_Paulo', label: 'São Paulo, Brazil', offset: 'UTC-3' },
  { value: 'America/Buenos_Aires', label: 'Buenos Aires, Argentina', offset: 'UTC-3' },
  { value: 'America/Lima', label: 'Lima, Peru', offset: 'UTC-5' },
  { value: 'America/Bogota', label: 'Bogota, Colombia', offset: 'UTC-5' },
  { value: 'America/Santiago', label: 'Santiago, Chile', offset: 'UTC-4' },
  
  // Middle East
  { value: 'Asia/Dubai', label: 'Dubai, UAE', offset: 'UTC+4' },
  { value: 'Asia/Riyadh', label: 'Riyadh, Saudi Arabia', offset: 'UTC+3' },
  { value: 'Asia/Doha', label: 'Doha, Qatar', offset: 'UTC+3' },
  { value: 'Asia/Kuwait', label: 'Kuwait City, Kuwait', offset: 'UTC+3' },
  { value: 'Asia/Bahrain', label: 'Manama, Bahrain', offset: 'UTC+3' },
  { value: 'Asia/Jerusalem', label: 'Tel Aviv, Israel', offset: 'UTC+2' },
  { value: 'Asia/Beirut', label: 'Beirut, Lebanon', offset: 'UTC+2' },
  
  // Asia
  { value: 'Asia/Tokyo', label: 'Tokyo, Japan', offset: 'UTC+9' },
  { value: 'Asia/Shanghai', label: 'Shanghai, China', offset: 'UTC+8' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong', offset: 'UTC+8' },
  { value: 'Asia/Singapore', label: 'Singapore', offset: 'UTC+8' },
  { value: 'Asia/Seoul', label: 'Seoul, South Korea', offset: 'UTC+9' },
  { value: 'Asia/Bangkok', label: 'Bangkok, Thailand', offset: 'UTC+7' },
  { value: 'Asia/Jakarta', label: 'Jakarta, Indonesia', offset: 'UTC+7' },
  { value: 'Asia/Manila', label: 'Manila, Philippines', offset: 'UTC+8' },
  { value: 'Asia/Kuala_Lumpur', label: 'Kuala Lumpur, Malaysia', offset: 'UTC+8' },
  { value: 'Asia/Ho_Chi_Minh', label: 'Ho Chi Minh, Vietnam', offset: 'UTC+7' },
  { value: 'Asia/Kolkata', label: 'Mumbai, India', offset: 'UTC+5:30' },
  { value: 'Asia/Taipei', label: 'Taipei, Taiwan', offset: 'UTC+8' },
  
  // Oceania
  { value: 'Australia/Sydney', label: 'Sydney, Australia', offset: 'UTC+11' },
  { value: 'Australia/Melbourne', label: 'Melbourne, Australia', offset: 'UTC+11' },
  { value: 'Australia/Brisbane', label: 'Brisbane, Australia', offset: 'UTC+10' },
  { value: 'Australia/Perth', label: 'Perth, Australia', offset: 'UTC+8' },
  { value: 'Pacific/Auckland', label: 'Auckland, New Zealand', offset: 'UTC+13' },
  { value: 'Pacific/Fiji', label: 'Fiji', offset: 'UTC+12' },
  { value: 'Pacific/Tahiti', label: 'Tahiti, French Polynesia', offset: 'UTC-10' },
  
  // Africa
  { value: 'Africa/Casablanca', label: 'Casablanca, Morocco', offset: 'UTC+1' },
  { value: 'Africa/Cairo', label: 'Cairo, Egypt', offset: 'UTC+2' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg, South Africa', offset: 'UTC+2' },
  { value: 'Africa/Lagos', label: 'Lagos, Nigeria', offset: 'UTC+1' },
  { value: 'Africa/Nairobi', label: 'Nairobi, Kenya', offset: 'UTC+3' },
  { value: 'Africa/Tunis', label: 'Tunis, Tunisia', offset: 'UTC+1' },
  
  // Indian Ocean
  { value: 'Indian/Maldives', label: 'Maldives', offset: 'UTC+5' },
  { value: 'Indian/Mauritius', label: 'Mauritius', offset: 'UTC+4' },
  { value: 'Indian/Reunion', label: 'Réunion, France', offset: 'UTC+4' },
  { value: 'Asia/Colombo', label: 'Sri Lanka', offset: 'UTC+5:30' },
  
  // Caribbean
  { value: 'America/Martinique', label: 'Martinique, France', offset: 'UTC-4' },
  { value: 'America/Guadeloupe', label: 'Guadeloupe, France', offset: 'UTC-4' },
  { value: 'America/Nassau', label: 'Nassau, Bahamas', offset: 'UTC-5' },
  { value: 'America/Jamaica', label: 'Jamaica', offset: 'UTC-5' },
  { value: 'America/Santo_Domingo', label: 'Santo Domingo, Dominican Republic', offset: 'UTC-4' },
  { value: 'America/Puerto_Rico', label: 'San Juan, Puerto Rico', offset: 'UTC-4' },
  { value: 'America/Barbados', label: 'Barbados', offset: 'UTC-4' },
  { value: 'America/St_Lucia', label: 'Saint Lucia', offset: 'UTC-4' },
];

// Country to timezone mapping for auto-suggestion
const COUNTRY_TIMEZONE_MAP: Record<string, string> = {
  // Europe
  'france': 'Europe/Paris',
  'fr': 'Europe/Paris',
  'united kingdom': 'Europe/London',
  'uk': 'Europe/London',
  'england': 'Europe/London',
  'germany': 'Europe/Berlin',
  'de': 'Europe/Berlin',
  'spain': 'Europe/Madrid',
  'es': 'Europe/Madrid',
  'italy': 'Europe/Rome',
  'it': 'Europe/Rome',
  'netherlands': 'Europe/Amsterdam',
  'nl': 'Europe/Amsterdam',
  'belgium': 'Europe/Brussels',
  'be': 'Europe/Brussels',
  'switzerland': 'Europe/Zurich',
  'ch': 'Europe/Zurich',
  'austria': 'Europe/Vienna',
  'at': 'Europe/Vienna',
  'sweden': 'Europe/Stockholm',
  'se': 'Europe/Stockholm',
  'norway': 'Europe/Oslo',
  'no': 'Europe/Oslo',
  'denmark': 'Europe/Copenhagen',
  'dk': 'Europe/Copenhagen',
  'finland': 'Europe/Helsinki',
  'fi': 'Europe/Helsinki',
  'greece': 'Europe/Athens',
  'gr': 'Europe/Athens',
  'portugal': 'Europe/Lisbon',
  'pt': 'Europe/Lisbon',
  'ireland': 'Europe/Dublin',
  'ie': 'Europe/Dublin',
  'poland': 'Europe/Warsaw',
  'pl': 'Europe/Warsaw',
  'czech republic': 'Europe/Prague',
  'cz': 'Europe/Prague',
  'hungary': 'Europe/Budapest',
  'hu': 'Europe/Budapest',
  'romania': 'Europe/Bucharest',
  'ro': 'Europe/Bucharest',
  'russia': 'Europe/Moscow',
  'ru': 'Europe/Moscow',
  'turkey': 'Europe/Istanbul',
  'tr': 'Europe/Istanbul',
  'monaco': 'Europe/Monaco',
  'mc': 'Europe/Monaco',
  
  // Americas
  'united states': 'America/New_York',
  'usa': 'America/New_York',
  'us': 'America/New_York',
  'canada': 'America/Toronto',
  'ca': 'America/Toronto',
  'mexico': 'America/Mexico_City',
  'mx': 'America/Mexico_City',
  'brazil': 'America/Sao_Paulo',
  'br': 'America/Sao_Paulo',
  'argentina': 'America/Buenos_Aires',
  'ar': 'America/Buenos_Aires',
  'peru': 'America/Lima',
  'pe': 'America/Lima',
  'colombia': 'America/Bogota',
  'co': 'America/Bogota',
  'chile': 'America/Santiago',
  'cl': 'America/Santiago',
  
  // Middle East
  'united arab emirates': 'Asia/Dubai',
  'uae': 'Asia/Dubai',
  'ae': 'Asia/Dubai',
  'saudi arabia': 'Asia/Riyadh',
  'sa': 'Asia/Riyadh',
  'qatar': 'Asia/Doha',
  'qa': 'Asia/Doha',
  'kuwait': 'Asia/Kuwait',
  'kw': 'Asia/Kuwait',
  'bahrain': 'Asia/Bahrain',
  'bh': 'Asia/Bahrain',
  'israel': 'Asia/Jerusalem',
  'il': 'Asia/Jerusalem',
  'lebanon': 'Asia/Beirut',
  'lb': 'Asia/Beirut',
  
  // Asia
  'japan': 'Asia/Tokyo',
  'jp': 'Asia/Tokyo',
  'china': 'Asia/Shanghai',
  'cn': 'Asia/Shanghai',
  'hong kong': 'Asia/Hong_Kong',
  'hk': 'Asia/Hong_Kong',
  'singapore': 'Asia/Singapore',
  'sg': 'Asia/Singapore',
  'south korea': 'Asia/Seoul',
  'korea': 'Asia/Seoul',
  'kr': 'Asia/Seoul',
  'thailand': 'Asia/Bangkok',
  'th': 'Asia/Bangkok',
  'indonesia': 'Asia/Jakarta',
  'id': 'Asia/Jakarta',
  'philippines': 'Asia/Manila',
  'ph': 'Asia/Manila',
  'malaysia': 'Asia/Kuala_Lumpur',
  'my': 'Asia/Kuala_Lumpur',
  'vietnam': 'Asia/Ho_Chi_Minh',
  'vn': 'Asia/Ho_Chi_Minh',
  'india': 'Asia/Kolkata',
  'in': 'Asia/Kolkata',
  'taiwan': 'Asia/Taipei',
  'tw': 'Asia/Taipei',
  
  // Oceania
  'australia': 'Australia/Sydney',
  'au': 'Australia/Sydney',
  'new zealand': 'Pacific/Auckland',
  'nz': 'Pacific/Auckland',
  'fiji': 'Pacific/Fiji',
  'fj': 'Pacific/Fiji',
  'french polynesia': 'Pacific/Tahiti',
  'pf': 'Pacific/Tahiti',
  
  // Africa
  'morocco': 'Africa/Casablanca',
  'ma': 'Africa/Casablanca',
  'egypt': 'Africa/Cairo',
  'eg': 'Africa/Cairo',
  'south africa': 'Africa/Johannesburg',
  'za': 'Africa/Johannesburg',
  'nigeria': 'Africa/Lagos',
  'ng': 'Africa/Lagos',
  'kenya': 'Africa/Nairobi',
  'ke': 'Africa/Nairobi',
  'tunisia': 'Africa/Tunis',
  'tn': 'Africa/Tunis',
  
  // Indian Ocean
  'maldives': 'Indian/Maldives',
  'mv': 'Indian/Maldives',
  'mauritius': 'Indian/Mauritius',
  'mu': 'Indian/Mauritius',
  'reunion': 'Indian/Reunion',
  're': 'Indian/Reunion',
  'sri lanka': 'Asia/Colombo',
  'lk': 'Asia/Colombo',
  
  // Caribbean
  'martinique': 'America/Martinique',
  'mq': 'America/Martinique',
  'guadeloupe': 'America/Guadeloupe',
  'gp': 'America/Guadeloupe',
  'bahamas': 'America/Nassau',
  'bs': 'America/Nassau',
  'jamaica': 'America/Jamaica',
  'jm': 'America/Jamaica',
  'dominican republic': 'America/Santo_Domingo',
  'do': 'America/Santo_Domingo',
  'puerto rico': 'America/Puerto_Rico',
  'pr': 'America/Puerto_Rico',
  'barbados': 'America/Barbados',
  'bb': 'America/Barbados',
  'saint lucia': 'America/St_Lucia',
  'st lucia': 'America/St_Lucia',
  'lc': 'America/St_Lucia',
};

/**
 * Suggests a timezone based on country name or country code
 */
export function suggestTimezoneFromCountry(country: string): string {
  if (!country) return 'Europe/Paris';

  const normalized = country.toLowerCase().trim();
  return COUNTRY_TIMEZONE_MAP[normalized] || 'Europe/Paris';
}

// Country defaults mapping (timezone, currency, VAT rate)
export const COUNTRY_DEFAULTS: Record<string, CountryDefaults> = {
  // Europe
  'france': { timezone: 'Europe/Paris', currency: 'EUR', vat: 20 },
  'fr': { timezone: 'Europe/Paris', currency: 'EUR', vat: 20 },
  'germany': { timezone: 'Europe/Berlin', currency: 'EUR', vat: 19 },
  'de': { timezone: 'Europe/Berlin', currency: 'EUR', vat: 19 },
  'spain': { timezone: 'Europe/Madrid', currency: 'EUR', vat: 21 },
  'es': { timezone: 'Europe/Madrid', currency: 'EUR', vat: 21 },
  'italy': { timezone: 'Europe/Rome', currency: 'EUR', vat: 22 },
  'it': { timezone: 'Europe/Rome', currency: 'EUR', vat: 22 },
  'netherlands': { timezone: 'Europe/Amsterdam', currency: 'EUR', vat: 21 },
  'nl': { timezone: 'Europe/Amsterdam', currency: 'EUR', vat: 21 },
  'belgium': { timezone: 'Europe/Brussels', currency: 'EUR', vat: 21 },
  'be': { timezone: 'Europe/Brussels', currency: 'EUR', vat: 21 },
  'austria': { timezone: 'Europe/Vienna', currency: 'EUR', vat: 20 },
  'at': { timezone: 'Europe/Vienna', currency: 'EUR', vat: 20 },
  'portugal': { timezone: 'Europe/Lisbon', currency: 'EUR', vat: 23 },
  'pt': { timezone: 'Europe/Lisbon', currency: 'EUR', vat: 23 },
  'ireland': { timezone: 'Europe/Dublin', currency: 'EUR', vat: 23 },
  'ie': { timezone: 'Europe/Dublin', currency: 'EUR', vat: 23 },
  'greece': { timezone: 'Europe/Athens', currency: 'EUR', vat: 24 },
  'gr': { timezone: 'Europe/Athens', currency: 'EUR', vat: 24 },
  'finland': { timezone: 'Europe/Helsinki', currency: 'EUR', vat: 24 },
  'fi': { timezone: 'Europe/Helsinki', currency: 'EUR', vat: 24 },
  'monaco': { timezone: 'Europe/Monaco', currency: 'EUR', vat: 20 },
  'mc': { timezone: 'Europe/Monaco', currency: 'EUR', vat: 20 },
  // Non-EUR Europe
  'united kingdom': { timezone: 'Europe/London', currency: 'GBP', vat: 20 },
  'uk': { timezone: 'Europe/London', currency: 'GBP', vat: 20 },
  'england': { timezone: 'Europe/London', currency: 'GBP', vat: 20 },
  'switzerland': { timezone: 'Europe/Zurich', currency: 'CHF', vat: 8.1 },
  'ch': { timezone: 'Europe/Zurich', currency: 'CHF', vat: 8.1 },
  'sweden': { timezone: 'Europe/Stockholm', currency: 'SEK', vat: 25 },
  'se': { timezone: 'Europe/Stockholm', currency: 'SEK', vat: 25 },
  'norway': { timezone: 'Europe/Oslo', currency: 'NOK', vat: 25 },
  'no': { timezone: 'Europe/Oslo', currency: 'NOK', vat: 25 },
  'denmark': { timezone: 'Europe/Copenhagen', currency: 'DKK', vat: 25 },
  'dk': { timezone: 'Europe/Copenhagen', currency: 'DKK', vat: 25 },
  'poland': { timezone: 'Europe/Warsaw', currency: 'PLN', vat: 23 },
  'pl': { timezone: 'Europe/Warsaw', currency: 'PLN', vat: 23 },
  'czech republic': { timezone: 'Europe/Prague', currency: 'CZK', vat: 21 },
  'cz': { timezone: 'Europe/Prague', currency: 'CZK', vat: 21 },
  'hungary': { timezone: 'Europe/Budapest', currency: 'HUF', vat: 27 },
  'hu': { timezone: 'Europe/Budapest', currency: 'HUF', vat: 27 },
  'romania': { timezone: 'Europe/Bucharest', currency: 'RON', vat: 19 },
  'ro': { timezone: 'Europe/Bucharest', currency: 'RON', vat: 19 },
  'turkey': { timezone: 'Europe/Istanbul', currency: 'TRY', vat: 20 },
  'tr': { timezone: 'Europe/Istanbul', currency: 'TRY', vat: 20 },
  // Middle East
  'united arab emirates': { timezone: 'Asia/Dubai', currency: 'AED', vat: 5 },
  'uae': { timezone: 'Asia/Dubai', currency: 'AED', vat: 5 },
  'ae': { timezone: 'Asia/Dubai', currency: 'AED', vat: 5 },
  'saudi arabia': { timezone: 'Asia/Riyadh', currency: 'SAR', vat: 15 },
  'sa': { timezone: 'Asia/Riyadh', currency: 'SAR', vat: 15 },
  'qatar': { timezone: 'Asia/Doha', currency: 'QAR', vat: 0 },
  'qa': { timezone: 'Asia/Doha', currency: 'QAR', vat: 0 },
  'kuwait': { timezone: 'Asia/Kuwait', currency: 'KWD', vat: 0 },
  'kw': { timezone: 'Asia/Kuwait', currency: 'KWD', vat: 0 },
  'bahrain': { timezone: 'Asia/Bahrain', currency: 'BHD', vat: 10 },
  'bh': { timezone: 'Asia/Bahrain', currency: 'BHD', vat: 10 },
  'israel': { timezone: 'Asia/Jerusalem', currency: 'ILS', vat: 17 },
  'il': { timezone: 'Asia/Jerusalem', currency: 'ILS', vat: 17 },
  // Americas
  'united states': { timezone: 'America/New_York', currency: 'USD', vat: 0 },
  'usa': { timezone: 'America/New_York', currency: 'USD', vat: 0 },
  'us': { timezone: 'America/New_York', currency: 'USD', vat: 0 },
  'canada': { timezone: 'America/Toronto', currency: 'CAD', vat: 5 },
  'ca': { timezone: 'America/Toronto', currency: 'CAD', vat: 5 },
  'mexico': { timezone: 'America/Mexico_City', currency: 'MXN', vat: 16 },
  'mx': { timezone: 'America/Mexico_City', currency: 'MXN', vat: 16 },
  'brazil': { timezone: 'America/Sao_Paulo', currency: 'BRL', vat: 0 },
  'br': { timezone: 'America/Sao_Paulo', currency: 'BRL', vat: 0 },
  // Asia Pacific
  'japan': { timezone: 'Asia/Tokyo', currency: 'JPY', vat: 10 },
  'jp': { timezone: 'Asia/Tokyo', currency: 'JPY', vat: 10 },
  'china': { timezone: 'Asia/Shanghai', currency: 'CNY', vat: 13 },
  'cn': { timezone: 'Asia/Shanghai', currency: 'CNY', vat: 13 },
  'hong kong': { timezone: 'Asia/Hong_Kong', currency: 'HKD', vat: 0 },
  'hk': { timezone: 'Asia/Hong_Kong', currency: 'HKD', vat: 0 },
  'singapore': { timezone: 'Asia/Singapore', currency: 'SGD', vat: 9 },
  'sg': { timezone: 'Asia/Singapore', currency: 'SGD', vat: 9 },
  'australia': { timezone: 'Australia/Sydney', currency: 'AUD', vat: 10 },
  'au': { timezone: 'Australia/Sydney', currency: 'AUD', vat: 10 },
  'new zealand': { timezone: 'Pacific/Auckland', currency: 'NZD', vat: 15 },
  'nz': { timezone: 'Pacific/Auckland', currency: 'NZD', vat: 15 },
  'india': { timezone: 'Asia/Kolkata', currency: 'INR', vat: 18 },
  'in': { timezone: 'Asia/Kolkata', currency: 'INR', vat: 18 },
  'thailand': { timezone: 'Asia/Bangkok', currency: 'THB', vat: 7 },
  'th': { timezone: 'Asia/Bangkok', currency: 'THB', vat: 7 },
  // Africa
  'south africa': { timezone: 'Africa/Johannesburg', currency: 'ZAR', vat: 15 },
  'za': { timezone: 'Africa/Johannesburg', currency: 'ZAR', vat: 15 },
  'morocco': { timezone: 'Africa/Casablanca', currency: 'MAD', vat: 20 },
  'ma': { timezone: 'Africa/Casablanca', currency: 'MAD', vat: 20 },
  'egypt': { timezone: 'Africa/Cairo', currency: 'EGP', vat: 14 },
  'eg': { timezone: 'Africa/Cairo', currency: 'EGP', vat: 14 },
  // Indian Ocean
  'maldives': { timezone: 'Indian/Maldives', currency: 'USD', vat: 16 },
  'mv': { timezone: 'Indian/Maldives', currency: 'USD', vat: 16 },
  'mauritius': { timezone: 'Indian/Mauritius', currency: 'MUR', vat: 15 },
  'mu': { timezone: 'Indian/Mauritius', currency: 'MUR', vat: 15 },
};

/**
 * Gets country defaults (timezone, currency, VAT) based on country name or code
 */
export function getCountryDefaults(country: string): CountryDefaults | null {
  if (!country) return null;
  const normalized = country.toLowerCase().trim();
  return COUNTRY_DEFAULTS[normalized] || null;
}

/**
 * Gets the timezone option by value
 */
export function getTimezoneOption(value: string): TimezoneOption | undefined {
  return TIMEZONE_OPTIONS.find(tz => tz.value === value);
}

/**
 * Gets the friendly label for a timezone
 */
export function getTimezoneLabel(value: string): string {
  const option = getTimezoneOption(value);
  return option?.label || value;
}

/**
 * Gets current UTC offset for a timezone
 */
export function getCurrentOffset(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find(p => p.type === 'timeZoneName');
    return offsetPart?.value || '';
  } catch {
    return '';
  }
}

/**
 * Groups timezones by region for display
 */
export function getGroupedTimezones(): Record<string, TimezoneOption[]> {
  return {
    'Europe': TIMEZONE_OPTIONS.filter(tz => tz.value.startsWith('Europe/')),
    'Americas': TIMEZONE_OPTIONS.filter(tz => tz.value.startsWith('America/')),
    'Middle East': TIMEZONE_OPTIONS.filter(tz => 
      ['Asia/Dubai', 'Asia/Riyadh', 'Asia/Doha', 'Asia/Kuwait', 'Asia/Bahrain', 'Asia/Jerusalem', 'Asia/Beirut'].includes(tz.value)
    ),
    'Asia Pacific': TIMEZONE_OPTIONS.filter(tz => 
      tz.value.startsWith('Asia/') && 
      !['Asia/Dubai', 'Asia/Riyadh', 'Asia/Doha', 'Asia/Kuwait', 'Asia/Bahrain', 'Asia/Jerusalem', 'Asia/Beirut'].includes(tz.value)
    ),
    'Oceania': TIMEZONE_OPTIONS.filter(tz => tz.value.startsWith('Australia/') || tz.value.startsWith('Pacific/')),
    'Africa': TIMEZONE_OPTIONS.filter(tz => tz.value.startsWith('Africa/')),
    'Indian Ocean & Caribbean': TIMEZONE_OPTIONS.filter(tz => 
      tz.value.startsWith('Indian/') || 
      ['America/Martinique', 'America/Guadeloupe', 'America/Nassau', 'America/Jamaica', 'America/Santo_Domingo', 'America/Puerto_Rico', 'America/Barbados', 'America/St_Lucia', 'Asia/Colombo'].includes(tz.value)
    ),
  };
}
