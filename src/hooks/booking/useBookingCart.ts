import { useState, useMemo } from "react";
import { CartItem } from "@/components/booking/CreateBookingDialog.schema";

interface TreatmentVariant {
  id: string;
  label?: string | null;
  price?: number | null;
  duration?: number | null;
  is_default?: boolean;
  guest_count?: number;
}

interface Treatment {
  id: string;
  name?: string;
  price?: number | null;
  duration?: number | null;
  price_on_request?: boolean | null;
  treatment_variants?: TreatmentVariant[];
  [key: string]: unknown;
}

export function useBookingCart(treatments: Treatment[] | undefined) {
  const [cart, setCart] = useState<CartItem[]>([]);

  const { totalPrice, totalDuration } = useMemo(() => {
    if (!treatments || !cart.length) return { totalPrice: 0, totalDuration: 0 };
    let p = 0, d = 0;
    cart.forEach(i => {
      const t = treatments.find(x => x.id === i.treatmentId);
      if (t) {
        const variant = i.variantId
          ? t.treatment_variants?.find(v => v.id === i.variantId)
          : null;
        p += (variant?.price ?? t.price ?? 0) * i.quantity;
        d += (variant?.duration ?? t.duration ?? 0) * i.quantity;
      }
    });
    return { totalPrice: p, totalDuration: d };
  }, [cart, treatments]);

  const hasOnRequestService = useMemo(() => {
    return cart.some(item => {
      const treatment = treatments?.find(t => t.id === item.treatmentId);
      return treatment?.price_on_request === true;
    });
  }, [cart, treatments]);

  const cartDetails = useMemo(() =>
    cart.map(i => ({ ...i, treatment: treatments?.find(x => x.id === i.treatmentId) })).filter(i => i.treatment),
    [cart, treatments]
  );

  // Each (treatmentId, variantId) pair is a distinct cart entry, allowing
  // e.g. 1 Solo + 1 Duo of the same treatment simultaneously.
  const addToCart = (treatmentId: string, variantId?: string | null) => {
    const treatment = treatments?.find(x => x.id === treatmentId);

    let resolvedVariantId: string | null;
    if (variantId !== undefined) {
      resolvedVariantId = variantId;
    } else {
      const defaultVariant = treatment?.treatment_variants?.find(v => v.is_default)
        ?? treatment?.treatment_variants?.[0]
        ?? null;
      resolvedVariantId = defaultVariant?.id ?? null;
    }

    setCart(p => {
      const existing = p.find(x => x.treatmentId === treatmentId && x.variantId === resolvedVariantId);
      if (existing) return p.map(x =>
        x.treatmentId === treatmentId && x.variantId === resolvedVariantId
          ? { ...x, quantity: x.quantity + 1 }
          : x
      );
      return [...p, { treatmentId, quantity: 1, variantId: resolvedVariantId }];
    });
  };

  const incrementCart = (treatmentId: string, variantId?: string | null) =>
    setCart(p => {
      const target = variantId !== undefined
        ? p.find(x => x.treatmentId === treatmentId && x.variantId === variantId)
        : p.find(x => x.treatmentId === treatmentId);
      if (!target) return p;
      return p.map(x => x === target ? { ...x, quantity: x.quantity + 1 } : x);
    });

  const decrementCart = (treatmentId: string, variantId?: string | null) =>
    setCart(p => {
      const matches = (x: CartItem) =>
        x.treatmentId === treatmentId && x.variantId === (variantId !== undefined ? variantId : x.variantId);
      // When variantId is omitted, decrement the first matching entry only.
      const target = p.find(matches);
      if (!target) return p;
      if (target.quantity <= 1) return p.filter(x => x !== target);
      return p.map(x => x === target ? { ...x, quantity: x.quantity - 1 } : x);
    });

  // Without variantId: returns total quantity across all variants of that treatment.
  // With variantId: returns quantity for that specific (treatmentId, variantId) pair.
  const getCartQuantity = (treatmentId: string, variantId?: string | null) => {
    if (variantId !== undefined) {
      return cart.find(x => x.treatmentId === treatmentId && x.variantId === variantId)?.quantity || 0;
    }
    return cart.filter(x => x.treatmentId === treatmentId).reduce((sum, x) => sum + x.quantity, 0);
  };

  const flatIds = useMemo(() => {
    const ids: string[] = [];
    cart.forEach(i => {
      for (let j = 0; j < i.quantity; j++) ids.push(i.treatmentId);
    });
    return ids;
  }, [cart]);

  return {
    cart,
    setCart,
    addToCart,
    incrementCart,
    decrementCart,
    getCartQuantity,
    flatIds,
    totalPrice,
    totalDuration,
    hasOnRequestService,
    cartDetails,
  };
}
