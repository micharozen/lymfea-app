/**
 * Currency conversion utilities for converting amounts to EUR
 */

export type ExchangeRatesMap = Record<string, number>;

/**
 * Fallback rates if API fails (rates TO EUR)
 * 1 USD = 0.92 EUR, 1 AED = 0.25 EUR, etc.
 */
export const FALLBACK_RATES: ExchangeRatesMap = {
  EUR: 1.0,
  USD: 0.92,
  GBP: 1.17,
  CHF: 1.04,
  AED: 0.25,
};

/**
 * Convert an amount from a currency to EUR
 * @param amount - The amount to convert
 * @param fromCurrency - The source currency code (EUR, USD, AED, etc.)
 * @param rates - Exchange rates map (currency -> EUR rate)
 * @returns Amount converted to EUR
 */
export function convertToEUR(
  amount: number,
  fromCurrency: string | null | undefined,
  rates: ExchangeRatesMap
): number {
  if (!fromCurrency || fromCurrency === 'EUR') {
    return amount;
  }

  const rate = rates[fromCurrency];
  if (!rate) {
    console.warn(`No exchange rate found for ${fromCurrency}, returning original amount`);
    return amount;
  }

  return amount * rate;
}
