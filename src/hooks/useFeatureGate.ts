import { useOrganizationSubscription } from "@/hooks/useOrganizationSubscription";

export interface FeatureGateResult {
  allowed: boolean;
  loading: boolean;
  planCode: string | null;
  /** True if the feature is in a higher plan and an upgrade is needed. */
  needsUpgrade: boolean;
}

export function useFeatureGate(featureKey: string): FeatureGateResult {
  const { data, isLoading } = useOrganizationSubscription();
  const features = data?.subscription?.plan?.features ?? [];
  const planCode = data?.subscription?.plan?.code ?? null;
  const allowed = Boolean(data?.hasActiveBilling) && features.includes(featureKey);

  return {
    allowed,
    loading: isLoading,
    planCode,
    needsUpgrade: !allowed && !isLoading,
  };
}
