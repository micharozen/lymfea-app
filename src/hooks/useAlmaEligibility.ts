import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AlmaPlanInstallment {
  amount: number; // in cents
  customerFee: number;
  dueDate: number; // unix timestamp
}

export interface AlmaPlan {
  installmentsCount: number;
  eligible: boolean;
  paymentPlan: AlmaPlanInstallment[] | null;
  constraints: {
    purchase_amount?: { minimum: number; maximum: number };
  } | null;
}

interface AlmaEligibilityResult {
  isEligible: boolean;
  plans: AlmaPlan[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * Check Alma BNPL eligibility for a given total amount (in EUR).
 * Returns the list of eligible plans (2x, 3x, 4x) with payment schedules.
 *
 * Only fetches when amount > 0. Refetches when amount changes.
 */
export function useAlmaEligibility(amount: number): AlmaEligibilityResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['alma-eligibility', amount],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('alma-check-eligibility', {
        body: { amount },
      });
      if (error) throw error;
      return data as { plans: AlmaPlan[] };
    },
    enabled: amount > 0,
    staleTime: 5 * 60 * 1000, // 5 min
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });

  const eligiblePlans = data?.plans?.filter((p) => p.eligible) ?? [];

  return {
    isEligible: eligiblePlans.length > 0,
    plans: eligiblePlans,
    isLoading,
    error: error as Error | null,
  };
}
