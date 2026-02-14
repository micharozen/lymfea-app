import { useState, useEffect } from 'react';
import { ExchangeRatesMap, FALLBACK_RATES } from '@/lib/currencyConversion';

interface UseExchangeRatesResult {
  rates: ExchangeRatesMap;
  loading: boolean;
  error: Error | null;
}

// Cache pour éviter les appels répétés pendant la session
let cachedRates: ExchangeRatesMap | null = null;

/**
 * Hook pour récupérer les taux de change depuis l'API Frankfurter
 * Les taux sont convertis pour être utilisables directement (X currency -> EUR)
 */
export function useExchangeRates(): UseExchangeRatesResult {
  const [rates, setRates] = useState<ExchangeRatesMap>(cachedRates || FALLBACK_RATES);
  const [loading, setLoading] = useState(!cachedRates);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Si on a déjà les taux en cache, pas besoin de refetch
    if (cachedRates) {
      setRates(cachedRates);
      setLoading(false);
      return;
    }

    const fetchRates = async () => {
      try {
        // ExchangeRate-API - gratuite, supporte AED
        const response = await fetch('https://open.er-api.com/v6/latest/EUR');

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        // L'API retourne les taux FROM EUR (1 EUR = X currency)
        // On doit inverser pour avoir TO EUR (1 X = Y EUR)
        const ratesMap: ExchangeRatesMap = { EUR: 1.0 };

        for (const [currency, rate] of Object.entries(data.rates)) {
          // Inverser le taux: si 1 EUR = 3.97 AED, alors 1 AED = 1/3.97 = 0.252 EUR
          ratesMap[currency] = 1 / (rate as number);
        }

        cachedRates = ratesMap;
        setRates(ratesMap);
      } catch (err) {
        console.error('Failed to fetch exchange rates:', err);
        setError(err instanceof Error ? err : new Error('Failed to fetch rates'));
        // On garde les fallback rates
      } finally {
        setLoading(false);
      }
    };

    fetchRates();
  }, []);

  return { rates, loading, error };
}
