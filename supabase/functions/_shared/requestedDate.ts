import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getVenueAvailability } from "./availability-query.ts";
import { pickFirstAvailableDate, type DateResolution } from "./pickAvailableDate.ts";

export { pickFirstAvailableDate };
export type { DateResolution };

export interface ResolveRequestedDateInput {
  hotelId: string;
  dates: string[];
  treatmentIds?: string[];
  guestCount?: number | null;
}

/**
 * Interroge la disponibilité du lieu et applique `pickFirstAvailableDate`.
 *
 * Une seule date proposée est renvoyée telle quelle sans appel : il n'y a rien
 * à arbitrer, et l'opérateur verra de toute façon l'agenda à la conversion.
 */
export async function resolveRequestedDate(
  supabase: SupabaseClient,
  input: ResolveRequestedDateInput,
): Promise<DateResolution> {
  const dates = input.dates.filter(Boolean);
  if (dates.length <= 1) {
    return { date: dates[0] ?? null, rejected: [], hadAlternatives: false };
  }

  try {
    const { slotsByDate, deployedDates } = await getVenueAvailability(
      // `availability-query` importe encore le SDK en 2.39.3 alors que
      // `supabase-admin` est en 2.57.2 : les deux types de client sont
      // structurellement identiques mais nominalement incompatibles. Le cast
      // est confiné ici — aligner les versions est un chantier à part.
      supabase as unknown as Parameters<typeof getVenueAvailability>[0],
      input.hotelId,
      dates,
      {
        treatmentIds: input.treatmentIds ?? [],
        requiredGuestCount: Math.max(1, input.guestCount ?? 1),
      },
    );
    return pickFirstAvailableDate(dates, slotsByDate, deployedDates);
  } catch (_error) {
    // La disponibilité ne doit jamais faire échouer l'analyse : sans elle, on
    // retombe sur la préférence exprimée par le client.
    return { date: dates[0], rejected: [], hadAlternatives: true };
  }
}
