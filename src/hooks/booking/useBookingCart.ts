import { useState, useMemo } from "react";
import { CartItem } from "@/components/booking/CreateBookingDialog.schema";

interface Treatment {
  id: string;
  name?: string;
  price?: number | null;
  duration?: number | null;
  price_on_request?: boolean | null;
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
        p += (t.price || 0) * i.quantity;
        d += (t.duration || 0) * i.quantity;
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

  const addToCart = (id: string) => setCart(p => {
    const e = p.find(x => x.treatmentId === id);
    return e ? p.map(x => x.treatmentId === id ? { ...x, quantity: x.quantity + 1 } : x) : [...p, { treatmentId: id, quantity: 1 }];
  });

  const incrementCart = (id: string) => setCart(p => p.map(x => x.treatmentId === id ? { ...x, quantity: x.quantity + 1 } : x));

  const decrementCart = (id: string) => setCart(p => {
    const e = p.find(x => x.treatmentId === id);
    return e && e.quantity <= 1 ? p.filter(x => x.treatmentId !== id) : p.map(x => x.treatmentId === id ? { ...x, quantity: x.quantity - 1 } : x);
  });

  const getCartQuantity = (treatmentId: string) => {
    return cart.find(x => x.treatmentId === treatmentId)?.quantity || 0;
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
