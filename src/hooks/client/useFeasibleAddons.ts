import { useEffect, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCartKey, type BasketItem } from '@/pages/client/context/CartContext';

export interface AddonRow {
  id: string;
  name: string;
  name_en: string | null;
  description: string | null;
  description_en: string | null;
  category: string;
  duration: number | null;
  price: number | null;
  price_on_request: boolean | null;
  image: string | null;
  currency: string | null;
  sort_order: number | null;
}

export interface FeasibleAddon {
  addon: AddonRow;
  parentKey: string;
  parentName: string;
  /** Effective start time (HH:MM:SS) for this add-on after the base slot. */
  startTime: string;
}

interface UseFeasibleAddonsParams {
  hotelId: string;
  date: string;
  time: string;
  baseItems: BasketItem[];
  /** Only fetch + check while true. Set to true once the user intends to continue. */
  enabled: boolean;
}

interface UseFeasibleAddonsResult {
  feasibleAddons: FeasibleAddon[];
  /** True while candidate fetch OR availability check is in flight. */
  isChecking: boolean;
  /** True once we have a definitive answer for the current inputs. */
  isReady: boolean;
}

const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const minutesToTime = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
};

/**
 * Determines which add-ons can be chained right after the base slot.
 * Runs two stages: (1) fetch add-on candidates per base item via RPC,
 * (2) for each candidate call `check-availability` and verify a slot ≥ slotEndTime
 * exists within 30 minutes tolerance.
 */
export function useFeasibleAddons({
  hotelId,
  date,
  time,
  baseItems,
  enabled,
}: UseFeasibleAddonsParams): UseFeasibleAddonsResult {
  const totalBaseDuration = useMemo(
    () => baseItems.reduce((sum, i) => sum + (i.duration || 0) * (i.quantity || 1), 0),
    [baseItems],
  );

  const slotEndTime = useMemo(() => {
    if (!time) return null;
    return minutesToTime(timeToMinutes(time) + totalBaseDuration);
  }, [time, totalBaseDuration]);

  const addonQueries = useQueries({
    queries: baseItems.map((item) => ({
      queryKey: ['treatment-addons', item.id],
      queryFn: async (): Promise<AddonRow[]> => {
        const { data, error } = await supabase.rpc('get_public_treatment_addons', {
          _parent_id: item.id,
        });
        if (error) throw error;
        return (data ?? []) as AddonRow[];
      },
      enabled: enabled && !!item.id,
      staleTime: 5 * 60 * 1000,
    })),
  });

  const isLoadingCandidates = enabled && addonQueries.some((q) => q.isLoading);

  const candidatesByAddon = useMemo(() => {
    const map = new Map<string, { addon: AddonRow; parent: BasketItem }>();
    addonQueries.forEach((q, idx) => {
      const parent = baseItems[idx];
      if (!parent || !q.data) return;
      for (const addon of q.data) {
        if (!map.has(addon.id)) {
          map.set(addon.id, { addon, parent });
        }
      }
    });
    return map;
  }, [addonQueries, baseItems]);

  const [feasibleAddons, setFeasibleAddons] = useState<FeasibleAddon[]>([]);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setFeasibleAddons([]);
      setIsReady(false);
      return;
    }
    if (!slotEndTime || isLoadingCandidates) return;

    if (candidatesByAddon.size === 0) {
      setFeasibleAddons([]);
      setIsReady(true);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setIsCheckingAvailability(true);
      try {
        const checks = await Promise.all(
          Array.from(candidatesByAddon.values()).map(async ({ addon, parent }) => {
            try {
              const { data, error } = await supabase.functions.invoke('check-availability', {
                body: { hotelId, date, treatmentIds: [addon.id] },
              });
              if (error) return null;
              const slots: string[] = data?.availableSlots || [];
              const endMin = timeToMinutes(slotEndTime);
              const slotMinutes = slots.map((s) => timeToMinutes(s)).sort((a, b) => a - b);
              const earliest = slotMinutes.find((m) => m >= endMin);
              const fits = earliest !== undefined && earliest - endMin <= 30;
              if (!fits) return null;
              const effectiveStart =
                earliest !== undefined ? minutesToTime(earliest) : slotEndTime;
              return {
                addon,
                parentKey: getCartKey(parent.id, parent.variantId),
                parentName: parent.name,
                startTime: effectiveStart,
              } satisfies FeasibleAddon;
            } catch {
              return null;
            }
          }),
        );
        if (cancelled) return;
        setFeasibleAddons(checks.filter((x): x is FeasibleAddon => x !== null));
      } finally {
        if (!cancelled) {
          setIsCheckingAvailability(false);
          setIsReady(true);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, slotEndTime, isLoadingCandidates, hotelId, date, candidatesByAddon.size]);

  return {
    feasibleAddons,
    isChecking: isLoadingCandidates || isCheckingAvailability,
    isReady,
  };
}
