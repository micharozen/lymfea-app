import { fetchPublicTreatments } from "./publicTreatments.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import type {
  TreatmentRef,
  TreatmentVariantRef,
} from "../llm-agent/actions/parseEmail.ts";

/**
 * Catalogue d'un lieu, dans la forme attendue par le parseur d'intention.
 *
 * `get_public_treatments` fusionne déjà le flag add-on (soin + catégorie) et
 * renvoie les variantes en un appel — voir publicTreatments.ts. Partagé entre
 * le webhook entrant et l'analyse d'un texte collé, pour que les deux chemins
 * proposent exactement le même catalogue au modèle.
 */
export async function loadTreatmentRefs(
  client: SupabaseClient,
  hotelId: string,
): Promise<TreatmentRef[]> {
  const treatments = await fetchPublicTreatments(client, hotelId);
  return treatments.map((t) => ({
    id: t.id,
    name: t.name,
    name_en: t.name_en,
    duration: t.duration,
    category: t.category,
    is_addon: t.is_addon,
    variants: t.variants.map((v): TreatmentVariantRef => ({
      id: v.id,
      treatment_id: t.id,
      label: v.label,
      label_en: v.label_en,
      duration: v.duration,
      guest_count: v.guest_count,
      is_default: v.is_default,
    })),
  }));
}
