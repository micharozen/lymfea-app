import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { BasketItem } from '@/pages/client/context/CartContext';
import { timeToMinutes } from '@/lib/amenityWindow';

/** Ligne amenity issue de get_public_treatments (sous-ensemble des colonnes). */
export interface AmenityRow {
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
  amenity_id: string | null;
  amenity_type: string | null;
}

export interface FeasibleAmenity {
  amenity: AmenityRow;
  /** L'accès peut se placer avant le soin (capacité OK sur la fenêtre before). */
  canBefore: boolean;
  /** L'accès peut se placer après les soins (capacité OK sur la fenêtre after). */
  canAfter: boolean;
}

interface UseFeasibleAmenitiesParams {
  hotelId: string;
  date: string;
  time: string;
  /** Items de base (soins non-amenity) : servent à calculer début/fin du bloc soin. */
  baseItems: BasketItem[];
  /** Ne fetch + check que si true (armé au clic « Continuer »). */
  enabled: boolean;
}

interface UseFeasibleAmenitiesResult {
  feasibleAmenities: FeasibleAmenity[];
  isChecking: boolean;
  isReady: boolean;
}

/** Tolérance (min) pour aligner un créneau amenity sur la fin du soin (placement after). */
const AFTER_TOLERANCE = 30;
/** Nombre max d'accès amenity proposés (choice overload → conversion en baisse). */
const MAX_AMENITY_SUGGESTIONS = 2;

/**
 * Détermine quels accès amenity du lieu peuvent être proposés en upsell autour
 * du bloc soin choisi. Deux étapes :
 *   (1) candidats = amenity du lieu (get_public_treatments, amenity_id set) non
 *       déjà présents au panier, cappés à 2 ;
 *   (2) pour chaque candidat, get-availability (qui applique la capacité amenity)
 *       puis on teste les fenêtres before/after sur le créneau choisi.
 * Seuls les amenity plaçables (before ou after) sont retournés.
 */
export function useFeasibleAmenities({
  hotelId,
  date,
  time,
  baseItems,
  enabled,
}: UseFeasibleAmenitiesParams): UseFeasibleAmenitiesResult {
  const cartIds = useMemo(() => new Set(baseItems.map((i) => i.id)), [baseItems]);

  const totalBaseDuration = useMemo(
    () => baseItems.reduce((sum, i) => sum + (i.duration || 0) * (i.quantity || 1), 0),
    [baseItems],
  );

  // Réutilise le cache partagé de la liste des soins (préfetch ClientFlowWrapper).
  const { data: treatments = [], isLoading: isLoadingTreatments } = useQuery({
    queryKey: ['public-treatments', hotelId],
    queryFn: async (): Promise<AmenityRow[]> => {
      const { data, error } = await supabase.rpc('get_public_treatments', {
        _hotel_id: hotelId,
      });
      if (error) throw error;
      return (data ?? []) as unknown as AmenityRow[];
    },
    enabled: enabled && !!hotelId,
    staleTime: 5 * 60 * 1000,
  });

  const candidates = useMemo(() => {
    if (!enabled) return [];
    return treatments
      .filter((t) => !!t.amenity_id && !cartIds.has(t.id))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .slice(0, MAX_AMENITY_SUGGESTIONS);
  }, [enabled, treatments, cartIds]);

  const candidateKey = useMemo(() => candidates.map((c) => c.id).join(','), [candidates]);

  const [feasibleAmenities, setFeasibleAmenities] = useState<FeasibleAmenity[]>([]);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setFeasibleAmenities([]);
      setIsReady(false);
      return;
    }
    if (!time || !date || isLoadingTreatments) return;

    if (candidates.length === 0) {
      setFeasibleAmenities([]);
      setIsReady(true);
      return;
    }

    const soinStartMin = timeToMinutes(time);
    const soinEndMin = soinStartMin + totalBaseDuration;

    let cancelled = false;
    const run = async () => {
      setIsCheckingAvailability(true);
      try {
        const checks = await Promise.all(
          candidates.map(async (amenity) => {
            try {
              const { data, error } = await supabase.functions.invoke('get-availability', {
                body: { hotelId, date, treatmentIds: [amenity.id] },
              });
              if (error) return null;
              const slots: string[] = data?.availableSlots || [];
              const slotMinutes = slots.map((s) => timeToMinutes(s)).sort((a, b) => a - b);
              const amenityDuration = amenity.duration || 0;

              // After : un créneau amenity démarrant à la fin du soin (tolérance).
              const canAfter = slotMinutes.some(
                (m) => m >= soinEndMin && m - soinEndMin <= AFTER_TOLERANCE,
              );
              // Before : un créneau amenity qui se termine avant le début du soin.
              const beforeStart = soinStartMin - amenityDuration;
              const canBefore = beforeStart >= 0 && slotMinutes.includes(beforeStart);

              if (!canBefore && !canAfter) return null;
              return { amenity, canBefore, canAfter } satisfies FeasibleAmenity;
            } catch {
              return null;
            }
          }),
        );
        if (cancelled) return;
        setFeasibleAmenities(checks.filter((x): x is FeasibleAmenity => x !== null));
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
  }, [enabled, time, date, isLoadingTreatments, hotelId, candidateKey, totalBaseDuration]);

  return {
    feasibleAmenities,
    isChecking: (enabled && isLoadingTreatments) || isCheckingAvailability,
    isReady,
  };
}
