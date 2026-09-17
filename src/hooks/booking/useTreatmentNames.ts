import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgScope } from "@/hooks/useOrgScope";
import { listTreatmentNamesForOrg, treatmentKeys } from "@shared/db";

/**
 * Noms de prestations de l'organisation, pour le filtre "prestation" de la
 * liste des réservations. Le filtre porte sur le nom : un soin proposé dans
 * plusieurs lieux reste une seule entrée.
 */
export function useTreatmentNames() {
  const scope = useOrgScope();

  return useQuery({
    queryKey: scope ? treatmentKeys.names(scope) : ["treatment-menus", "names", "disabled"],
    enabled: !!scope,
    staleTime: 5 * 60 * 1000,
    queryFn: () => listTreatmentNamesForOrg(supabase, scope!),
  });
}
