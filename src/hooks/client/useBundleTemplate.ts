import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BundleTemplate {
  total_sessions: number | null;
  name: string;
  title: string | null;
  bundle_type: "cure" | "gift_treatments" | "gift_amount" | null;
  amount_cents: number | null;
  currency: string | null;
}

export function useBundleTemplate(bundleId: string | null | undefined) {
  return useQuery<BundleTemplate | null>({
    queryKey: ["bundle-template", bundleId],
    queryFn: async () => {
      if (!bundleId) return null;
      const { data, error } = await supabase
        .from("treatment_bundles")
        .select("total_sessions, name, title, bundle_type, amount_cents, currency")
        .eq("id", bundleId)
        .single();
      if (error) throw error;
      return data as BundleTemplate;
    },
    enabled: !!bundleId,
    staleTime: 10 * 60 * 1000,
  });
}
