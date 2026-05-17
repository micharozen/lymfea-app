import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import type { BasketItem } from "./context/CartContext";

interface RestoredCart {
  id: string;
  hotel_id: string;
  cart_items: Array<{
    treatmentId: string;
    variantId?: string | null;
    quantity?: number;
    date?: string;
    time?: string;
  }>;
  booking_date: string | null;
  booking_time: string | null;
  therapist_gender: string | null;
}

interface PublicTreatment {
  id: string;
  name: string;
  price: number;
  duration: number;
  category: string | null;
  image_url: string | null;
  slug: string | null;
  currency: string | null;
  variants?: Array<{ id: string; name: string; price: number; duration: number }>;
}

export default function RestoreCart() {
  const { slug: routeSlug, abandonedCartId } = useParams<{
    slug: string;
    abandonedCartId: string;
  }>();
  const { t } = useTranslation("client");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abandonedCartId || !routeSlug) {
      setError(t("restore.invalidLink", { defaultValue: "Lien invalide" }));
      return;
    }

    (async () => {
      const { data: cartData, error: rpcError } = await supabase.rpc(
        "get_abandoned_cart_for_restore",
        { _id: abandonedCartId },
      );

      if (rpcError || !cartData) {
        setError(
          t("restore.expired", {
            defaultValue: "Ce lien n'est plus valide. Votre réservation a peut-être déjà été confirmée.",
          }),
        );
        return;
      }

      const cart = cartData as unknown as RestoredCart;

      // Resolve real hotel slug from id to use as URL segment.
      const { data: hotelRow } = await supabase
        .from("hotels")
        .select("id, slug")
        .eq("id", cart.hotel_id)
        .maybeSingle();
      const urlHotelSegment = hotelRow?.slug ?? cart.hotel_id;

      const { data: treatments, error: treatmentsError } = await supabase.rpc(
        "get_public_treatments",
        { _hotel_id: cart.hotel_id },
      );

      if (treatmentsError || !treatments) {
        setError(
          t("restore.fetchError", {
            defaultValue: "Impossible de récupérer le détail de votre panier.",
          }),
        );
        return;
      }

      const treatmentMap = new Map<string, PublicTreatment>(
        (treatments as PublicTreatment[]).map((tr) => [tr.id, tr]),
      );

      const basketItems: BasketItem[] = [];
      for (const ci of cart.cart_items ?? []) {
        const tr = treatmentMap.get(ci.treatmentId);
        if (!tr) continue;
        const variant = ci.variantId
          ? tr.variants?.find((v) => v.id === ci.variantId)
          : null;
        basketItems.push({
          id: tr.id,
          slug: tr.slug ?? undefined,
          variantId: variant?.id,
          variantLabel: variant?.name,
          name: tr.name,
          price: variant?.price ?? tr.price,
          currency: tr.currency ?? "EUR",
          duration: variant?.duration ?? tr.duration,
          quantity: ci.quantity ?? 1,
          category: tr.category ?? "",
          image: tr.image_url ?? undefined,
        });
      }

      if (basketItems.length === 0) {
        setError(
          t("restore.itemsUnavailable", {
            defaultValue: "Les soins de votre panier ne sont plus disponibles.",
          }),
        );
        return;
      }

      sessionStorage.setItem(`basket_${cart.hotel_id}`, JSON.stringify(basketItems));

      // Full-page navigation to remount providers and trigger sessionStorage reload.
      window.location.replace(`/client/${urlHotelSegment}/schedule`);
    })();
  }, [abandonedCartId, routeSlug, t]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">
            {t("restore.errorTitle", { defaultValue: "Lien indisponible" })}
          </h1>
          <p className="text-muted-foreground">{error}</p>
          <a
            href={`/client/${routeSlug}`}
            className="inline-block text-sm underline text-primary"
          >
            {t("restore.startOver", {
              defaultValue: "Reprendre depuis le début",
            })}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">
        {t("restore.loading", { defaultValue: "Restauration de votre panier..." })}
      </div>
    </div>
  );
}
