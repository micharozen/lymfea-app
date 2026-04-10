import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ActiveBundle {
  customerBundleId: string;
  bundleName: string;
  bundleNameEn: string | null;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  expiresAt: string;
  eligibleTreatmentIds: string[];
}

interface UseBundleDetectionParams {
  phone: string;
  hotelId: string;
  treatmentIds: string[];
}

export function useBundleDetection({ phone, hotelId, treatmentIds }: UseBundleDetectionParams) {
  const normalizedPhone = phone.replace(/[\s\-.]/g, '');
  const isEnabled = normalizedPhone.length >= 8 && !!hotelId && treatmentIds.length > 0;

  const { data: activeBundles = [], isLoading, error } = useQuery({
    queryKey: ['bundle-detection', normalizedPhone, hotelId, treatmentIds],
    queryFn: async (): Promise<ActiveBundle[]> => {
      const { data, error } = await supabase.rpc('detect_bundles_for_booking', {
        _phone: normalizedPhone,
        _hotel_id: hotelId,
        _treatment_ids: treatmentIds,
      });

      if (error) throw error;
      if (!data) return [];

      return (data as any[]).map((row) => ({
        customerBundleId: row.customer_bundle_id,
        bundleName: row.bundle_name,
        bundleNameEn: row.bundle_name_en,
        totalSessions: row.total_sessions,
        usedSessions: row.used_sessions,
        remainingSessions: row.remaining_sessions,
        expiresAt: row.expires_at,
        eligibleTreatmentIds: row.eligible_treatment_ids || [],
      }));
    },
    enabled: isEnabled,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  return { activeBundles, isLoading: isEnabled && isLoading, error };
}
