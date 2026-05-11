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

  const addToCart = (treatmentId: string) => {
    const treatment = treatments?.find(x => x.id === treatmentId);
    const defaultVariant = treatment?.treatment_variants?.find(v => v.is_default)
      ?? treatment?.treatment_variants?.[0]
      ?? null;

    setCart(p => {
      const existing = p.find(x => x.treatmentId === treatmentId);
      if (existing) return p.map(x => x.treatmentId === treatmentId ? { ...x, quantity: x.quantity + 1 } : x);
      return [...p, { treatmentId, quantity: 1, variantId: defaultVariant?.id ?? null }];
    });
  };

  const incrementCart = (treatmentId: string) =>
    setCart(p => p.map(x => x.treatmentId === treatmentId ? { ...x, quantity: x.quantity + 1 } : x));

  const decrementCart = (treatmentId: string) =>
    setCart(p => {
      const e = p.find(x => x.treatmentId === treatmentId);
      return e && e.quantity <= 1
        ? p.filter(x => x.treatmentId !== treatmentId)
        : p.map(x => x.treatmentId === treatmentId ? { ...x, quantity: x.quantity - 1 } : x);
    });

  const setVariant = (treatmentId: string, variantId: string | null) =>
    setCart(p => p.map(x => x.treatmentId === treatmentId ? { ...x, variantId } : x));

  const getCartVariant = (treatmentId: string): string | null =>
    cart.find(x => x.treatmentId === treatmentId)?.variantId ?? null;

  const getCartQuantity = (treatmentId: string) =>
    cart.find(x => x.treatmentId === treatmentId)?.quantity || 0;

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
    setVariant,
    getCartVariant,
    getCartQuantity,
    flatIds,
    totalPrice,
    totalDuration,
    hasOnRequestService,
    cartDetails,
  };
}
