import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TreatmentRateMap } from "@/lib/therapistEarnings";

export interface CurrentTherapist {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  gender: string | null;
  status: string | null;
  password_set: boolean | null;
  rate_30: number | null;
  rate_45: number | null;
  rate_60: number | null;
  rate_75: number | null;
  rate_90: number | null;
  rate_105: number | null;
  rate_120: number | null;
  rate_150: number | null;
  treatment_rates: TreatmentRateMap | null;
  treatment_rates_active: boolean | null;
}

export interface CurrentTherapistResult {
  userId: string | null;
  therapist: CurrentTherapist | null;
}

const THERAPIST_COLUMNS =
  "id, user_id, first_name, last_name, email, gender, status, password_set, rate_30, rate_45, rate_60, rate_75, rate_90, rate_105, rate_120, rate_150, treatment_rates, treatment_rates_active";

export const currentTherapistKey = ["pwa", "therapist", "me"] as const;

async function fetchCurrentTherapist(): Promise<CurrentTherapistResult> {
  // getSession() lit le stockage local, là où getUser() fait un aller-retour
  // réseau. La session est déjà validée en amont par TherapistProtectedRoute,
  // qui garde toutes les routes /pwa/*.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return { userId: null, therapist: null };

  const { data } = await supabase
    .from("therapists")
    .select(THERAPIST_COLUMNS)
    .eq("user_id", session.user.id)
    .maybeSingle();

  return {
    userId: session.user.id,
    therapist: (data as CurrentTherapist | null) ?? null,
  };
}

/**
 * Identité du thérapeute connecté, résolue une seule fois pour toute la coquille.
 *
 * Avant, Layout faisait trois `getUser()` + select sur therapists, Dashboard un
 * quatrième et Bookings un cinquième : cinq allers-retours séquentiels pour une
 * seule ligne, à chaque démarrage à froid.
 */
export function useCurrentTherapist() {
  return useQuery({
    queryKey: currentTherapistKey,
    queryFn: fetchCurrentTherapist,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}
