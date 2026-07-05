import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import {
  computeVenueCompleteness,
  VenueCheckState,
} from "@/lib/venueCompleteness";
import type { VenueWizardFormValues } from "@/components/admin/VenueWizardDialog";

/** A scored check enriched with its translated label. */
export interface VenueCheckItem extends VenueCheckState {
  label: string;
}

interface UseVenueCompletenessOptions {
  hotelId?: string;
  hasDeploymentSchedule: boolean;
}

/**
 * Live completeness of a venue's booking-flow configuration.
 * Combines the form values (watched live), the payment-provider connection
 * status and the deployment-schedule flag, then resolves i18n labels.
 */
export function useVenueCompleteness(
  form: UseFormReturn<VenueWizardFormValues>,
  { hotelId, hasDeploymentSchedule }: UseVenueCompletenessOptions,
): { percent: number; items: VenueCheckItem[] } {
  const { t: tAdmin } = useTranslation("admin");

  // Watched form values — re-renders on every edit for a live percentage.
  const values = form.watch();

  const { data: paymentConnected = false } = useQuery({
    queryKey: ["venue-payment-config-status", hotelId],
    enabled: !!hotelId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotel_payment_configs" as never)
        .select("provider, stripe_vault_secret_id, adyen_vault_secret_id")
        .eq("hotel_id", hotelId!)
        .maybeSingle();
      if (error || !data) return false;
      const config = data as {
        provider?: string | null;
        stripe_vault_secret_id?: string | null;
        adyen_vault_secret_id?: string | null;
      };
      return (
        !!config.provider &&
        config.provider !== "none" &&
        !!(config.stripe_vault_secret_id || config.adyen_vault_secret_id)
      );
    },
  });

  return useMemo(() => {
    const { percent, items } = computeVenueCompleteness({
      values,
      paymentConnected,
      hasDeploymentSchedule,
    });
    return {
      percent,
      items: items.map((item) => ({
        ...item,
        label: tAdmin(`venue.completeness.items.${item.id}`),
      })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values), paymentConnected, hasDeploymentSchedule, tAdmin]);
}
