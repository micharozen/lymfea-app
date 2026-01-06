/**
 * Currency symbols mapping
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  CHF: 'CHF',
};

/**
 * Format a price with the correct currency symbol placement
 * European format: amount + space + symbol (e.g., "42.00 €")
 * US/UK format: symbol + amount (e.g., "$42.00" or "£42.00")
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
  
  const formattedAmount = numAmount.toFixed(decimals);
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  
  // European currencies: amount + space + symbol
  if (currency === 'EUR' || currency === 'CHF') {
    return `${formattedAmount} ${symbol}`;
  }
  
  // USD/GBP: symbol + amount
  return `${symbol}${formattedAmount}`;
}

/**
 * Get currency symbol from currency code
 */
export function getCurrencySymbol(currency: string = 'EUR'): string {
  return CURRENCY_SYMBOLS[currency] || currency;
}
