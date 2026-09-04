import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";

export type BundleKind = "gift" | "cure";

/** Item du menu client, réduit aux champs nécessaires au comptage. */
export interface CountableTreatment {
  is_bundle?: boolean | null;
  bundle_id?: string | null;
}

/**
 * Type (`cure` / carte cadeau) de chaque forfait publié par le lieu.
 * Une seule requête pour tout le menu : les libellés de comptage en ont besoin
 * pour ne pas annoncer « 1 soin » devant une carte cadeau.
 */
export function useVenueBundleKinds(hotelId: string | null | undefined) {
  return useQuery<Record<string, BundleKind>>({
    queryKey: ["venue-bundle-kinds", hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatment_bundles")
        .select("id, bundle_type")
        .eq("hotel_id", hotelId!)
        .eq("status", "active");
      if (error) throw error;
      return Object.fromEntries(
        (data ?? []).map((b) => [
          b.id,
          b.bundle_type === "cure" ? "cure" : "gift",
        ]),
      ) as Record<string, BundleKind>;
    },
    enabled: !!hotelId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Libellé de comptage adapté au contenu : « 2 soins », « 2 cartes cadeaux »
 * ou « 2 cures » selon la nature homogène de la liste.
 */
export function useTreatmentCountLabel(hotelId: string | null | undefined) {
  const { t } = useTranslation("client");
  const { data: bundleKinds = {} } = useVenueBundleKinds(hotelId);

  return (treatments: CountableTreatment[], count: number): string => {
    const kinds = new Set(
      treatments.map((item) =>
        item.is_bundle && item.bundle_id
          ? bundleKinds[item.bundle_id] ?? "cure"
          : "treatment",
      ),
    );

    const plural = count !== 1;
    if (kinds.size === 1 && kinds.has("gift")) {
      return `${count} ${plural ? t("menu.giftCards") : t("menu.giftCard")}`;
    }
    if (kinds.size === 1 && kinds.has("cure")) {
      return `${count} ${plural ? t("menu.cures") : t("menu.cure")}`;
    }
    return `${count} ${plural ? t("menu.items") : t("menu.item")}`;
  };
}
