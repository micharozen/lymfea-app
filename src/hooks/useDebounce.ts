import { useEffect, useState } from "react";

/**
 * Valeur retardée : ne change qu'une fois `delay` ms écoulées sans nouvelle
 * saisie. Sert à ne pas déclencher une requête serveur par frappe clavier.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
