import type { ReactNode } from "react";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import { UpgradePrompt } from "@/components/billing/UpgradePrompt";

interface FeatureGateProps {
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { allowed, loading } = useFeatureGate(feature);

  if (loading) return null;
  if (!allowed) return fallback ?? <UpgradePrompt feature={feature} />;
  return <>{children}</>;
}
