import { useMemo } from 'react';

import { computePromoDiscount } from '@/lib/promo';
import type { BasketItem } from '@/pages/client/context/CartContext';
import type { AppliedPromo } from '@/pages/client/context/FlowContext';

/**
 * Remise du code promo appliquée au panier courant, pour l'affichage.
 *
 * Dérivée du panier à chaque rendu : retirer le soin ciblé par le code fait
 * tomber la remise à zéro sans qu'aucun effet n'ait à la resynchroniser. Le
 * serveur reste seul juge du montant réellement déduit.
 *
 * Partagée par Payment.tsx (mobile) et CheckoutPanel.tsx (desktop), qui sont
 * deux implémentations jumelles du même écran.
 */
export function useCartPromoDiscount(
  items: BasketItem[],
  appliedPromo: AppliedPromo | null,
): number {
  return useMemo(() => {
    if (!appliedPromo) return 0;
    return computePromoDiscount(
      items
        .filter((i) => !i.isPriceOnRequest)
        .map((i) => ({ treatmentId: i.id, lineTotal: i.price * i.quantity })),
      {
        id: appliedPromo.id,
        code: appliedPromo.code,
        discount_type: appliedPromo.discountType,
        discount_value: appliedPromo.discountValue,
        eligible_treatment_ids: appliedPromo.eligibleTreatmentIds,
      },
    ).discount;
  }, [items, appliedPromo]);
}
