import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Ids des prestations qu'un thérapeute peut réaliser. */
export function useTherapistTreatments(therapistId: string | null | undefined) {
  return useQuery({
    queryKey: ["therapist-treatments", therapistId],
    queryFn: async (): Promise<string[]> => {
      if (!therapistId) return [];
      const { data, error } = await supabase
        .from("therapist_treatments")
        .select("treatment_menu_id")
        .eq("therapist_id", therapistId);
      if (error) throw error;
      return (data ?? []).map((row) => row.treatment_menu_id);
    },
    enabled: !!therapistId,
  });
}

/**
 * Enregistre la liste des prestations d'un thérapeute par diff.
 *
 * On n'utilise pas le « delete-all puis re-insert » employé pour
 * therapist_venues : une liste vide vaut « polyvalent » pour le matching.
 * Purger avant de réinsérer ouvrirait une fenêtre où le thérapeute serait
 * proposé pour n'importe quelle prestation.
 */
export function useSetTherapistTreatments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      therapistId,
      treatmentMenuIds,
    }: {
      therapistId: string;
      treatmentMenuIds: string[];
    }) => {
      const { data, error: readError } = await supabase
        .from("therapist_treatments")
        .select("treatment_menu_id")
        .eq("therapist_id", therapistId);
      if (readError) throw readError;

      const current = new Set((data ?? []).map((row) => row.treatment_menu_id));
      const next = new Set(treatmentMenuIds);

      const toInsert = treatmentMenuIds.filter((id) => !current.has(id));
      const toDelete = [...current].filter((id) => !next.has(id));

      if (toInsert.length > 0) {
        const { error } = await supabase.from("therapist_treatments").insert(
          toInsert.map((treatment_menu_id) => ({
            therapist_id: therapistId,
            treatment_menu_id,
          }))
        );
        if (error) throw error;
      }

      if (toDelete.length > 0) {
        const { error } = await supabase
          .from("therapist_treatments")
          .delete()
          .eq("therapist_id", therapistId)
          .in("treatment_menu_id", toDelete);
        if (error) throw error;
      }
    },
    onSuccess: (_data, { therapistId }) => {
      queryClient.invalidateQueries({
        queryKey: ["therapist-treatments", therapistId],
      });
      queryClient.invalidateQueries({ queryKey: ["therapist-treatment-counts"] });
    },
  });
}

/** Nombre de prestations par thérapeute — alimente le badge « 0 prestation ». */
export function useTherapistTreatmentCounts() {
  return useQuery({
    queryKey: ["therapist-treatment-counts"],
    queryFn: async (): Promise<Record<string, number>> => {
      // PostgREST plafonne une réponse à 1000 lignes. Un comptage tronqué
      // afficherait de faux badges « 0 prestation », donc on pagine.
      const PAGE_SIZE = 1000;
      const counts: Record<string, number> = {};

      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from("therapist_treatments")
          .select("therapist_id")
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;

        for (const row of data ?? []) {
          counts[row.therapist_id] = (counts[row.therapist_id] ?? 0) + 1;
        }
        if (!data || data.length < PAGE_SIZE) break;
      }

      return counts;
    },
  });
}
