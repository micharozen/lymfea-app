import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VenueSettings {
  image: string | null;
  currency: string | null;
  global_therapist_commission: boolean;
  therapist_commission: number | null;
  out_of_hours_surcharge_percent: number | null;
}

export interface TherapistVenues {
  hotelIds: string[];
  priorityByHotel: Record<string, number>;
  settingsByHotel: Map<string, VenueSettings>;
}

const EMPTY: TherapistVenues = {
  hotelIds: [],
  priorityByHotel: {},
  settingsByHotel: new Map(),
};

async function fetchTherapistVenues(therapistId: string): Promise<TherapistVenues> {
  const { data: affiliated, error } = await supabase
    .from("therapist_venues")
    .select("hotel_id, priority")
    .eq("therapist_id", therapistId);

  if (error) throw error;
  if (!affiliated || affiliated.length === 0) return EMPTY;

  const hotelIds = affiliated.map((h) => h.hotel_id);

  // Commission et surcharge vivent sur le lieu, pas sur la réservation, et il
  // n'y a pas de relation FK exploitable depuis therapist_venues.
  const { data: hotels } = await supabase
    .from("hotels")
    .select(
      "id, image, currency, global_therapist_commission, therapist_commission, out_of_hours_surcharge_percent",
    )
    .in("id", hotelIds);

  return {
    hotelIds,
    priorityByHotel: Object.fromEntries(affiliated.map((h) => [h.hotel_id, h.priority ?? 1])),
    settingsByHotel: new Map(
      (hotels ?? []).map((h) => [
        h.id,
        {
          image: h.image,
          currency: h.currency,
          global_therapist_commission: h.global_therapist_commission === true,
          therapist_commission: h.therapist_commission,
          out_of_hours_surcharge_percent: h.out_of_hours_surcharge_percent,
        },
      ]),
    ),
  };
}

/** Lieux auxquels le thérapeute est affilié, avec leurs réglages de facturation. */
export function useTherapistVenues(therapistId: string | null | undefined) {
  return useQuery({
    queryKey: ["pwa", "venues", therapistId],
    queryFn: () => fetchTherapistVenues(therapistId!),
    enabled: !!therapistId,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}
