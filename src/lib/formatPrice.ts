/**
 * Currency symbols mapping
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  CHF: 'CHF',
  AED: 'AED',
};

/**
 * Currencies that place symbol after amount (European style)
 */
const SUFFIX_CURRENCIES = ['EUR', 'CHF'];

/**
 * Maximum number of decimals a price can carry.
 * Special prices (per-line overrides) may need a third decimal.
 */
export const MAX_PRICE_DECIMALS = 3;

/**
 * Round an amount to the price scale, removing floating point noise
 * (e.g. 12.345 * 3 = 37.034999999999997 -> 37.035)
 */
export function roundPrice(amount: number): number {
  const factor = 10 ** MAX_PRICE_DECIMALS;
  return Math.round(amount * factor) / factor;
}

/**
 * Number of decimals to actually display: never less than `minDecimals`,
 * never more than MAX_PRICE_DECIMALS, and only as many as the amount needs.
 */
function resolveDecimals(amount: number, minDecimals: number): number {
  const rounded = roundPrice(amount);
  for (let d = MAX_PRICE_DECIMALS; d > minDecimals; d--) {
    if (Number(rounded.toFixed(d)) !== Number(rounded.toFixed(d - 1))) return d;
  }
  return minDecimals;
}

/**
 * Format an amount without any currency symbol, with adaptive decimals.
 */
export function formatAmount(amount: number, minDecimals = 0): string {
  return roundPrice(amount).toFixed(resolveDecimals(amount, minDecimals));
}

/**
 * Format a price with the correct currency symbol placement
 * European format: amount + space + symbol (e.g., "42.00 €")
 * US/UK/AED format: symbol + space + amount (e.g., "$ 42.00" or "AED 42.00")
 * 
 * Decimals are adaptive: `decimals` is the minimum shown, and up to
 * MAX_PRICE_DECIMALS are added when the amount actually needs them
 * (e.g. a special price of 12.345).
 *
 * @param amount - The price amount (number or string)
 * @param currency - The currency code (EUR, USD, GBP, CHF). Defaults to EUR.
 * @param options - Additional formatting options
 * @returns Formatted price string
 */
export function formatPrice(
  amount: number | string | null | undefined,
  currency: string = 'EUR',
  options: {
    decimals?: number;
    showZero?: boolean;
  } = {}
): string {
  const { decimals = 2, showZero = true } = options;
  
  // Handle null/undefined/empty
  if (amount === null || amount === undefined || amount === '') {
    return showZero ? formatPrice(0, currency, options) : '-';
  }
  
  // Convert to number
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  // Handle NaN
  if (isNaN(numAmount)) {
    return showZero ? formatPrice(0, currency, options) : '-';
  }
  
  const formattedAmount = formatAmount(numAmount, decimals);
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  
  // European currencies: amount + space + symbol
  if (SUFFIX_CURRENCIES.includes(currency)) {
    return `${formattedAmount} ${symbol}`;
  }
  
  // USD/GBP/AED: symbol + space + amount
  return `${symbol} ${formattedAmount}`;
}

/**
 * Get currency symbol from currency code
 */
export function getCurrencySymbol(currency: string = 'EUR'): string {
  return CURRENCY_SYMBOLS[currency] || currency;
}
