import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';

export interface BasketItem {
  id: string;           // treatment_id
  variantId?: string;   // selected variant ID
  variantLabel?: string; // e.g. "60 min"
  name: string;
  price: number;
  currency?: string;
  duration: number;
  quantity: number;
  note?: string;
  image?: string;
  category: string;
  isPriceOnRequest?: boolean; // New field to track variable price items
}

/** Composite key for cart items — allows same treatment with different variants as separate items */
const getCartKey = (id: string, variantId?: string) => variantId ? `${id}__${variantId}` : id;

interface BasketContextType {
  items: BasketItem[];
  addItem: (item: Omit<BasketItem, 'quantity' | 'note'>) => void;
  removeItem: (id: string, variantId?: string) => void;
  updateQuantity: (id: string, quantity: number, variantId?: string) => void;
  updateNote: (id: string, note: string) => void;
  clearBasket: () => void;
  total: number;
  itemCount: number;
  fixedTotal: number; // Sum of fixed price items only
  hasPriceOnRequest: boolean; // True if any item requires a quote
}

const BasketContext = createContext<BasketContextType | undefined>(undefined);

export const BasketProvider: React.FC<{ children: React.ReactNode; hotelId: string }> = ({ 
  children, 
  hotelId 
}) => {
  const storageKey = `basket_${hotelId}`;
  
  const [items, setItems] = useState<BasketItem[]>(() => {
    const stored = sessionStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : [];
  });

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(items));
  }, [items, storageKey]);

  const addItem = (item: Omit<BasketItem, 'quantity' | 'note'>) => {
    setItems(prev => {
      const itemKey = getCartKey(item.id, item.variantId);
      const existing = prev.find(i => getCartKey(i.id, i.variantId) === itemKey);
      if (existing) {
        return prev.map(i =>
          getCartKey(i.id, i.variantId) === itemKey ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeItem = (id: string, variantId?: string) => {
    const key = getCartKey(id, variantId);
    setItems(prev => prev.filter(i => getCartKey(i.id, i.variantId) !== key));
  };

  const updateQuantity = (id: string, quantity: number, variantId?: string) => {
    if (quantity <= 0) {
      removeItem(id, variantId);
      return;
    }
    const key = getCartKey(id, variantId);
    setItems(prev => prev.map(i =>
      getCartKey(i.id, i.variantId) === key ? { ...i, quantity } : i
    ));
  };

  const updateNote = (id: string, note: string) => {
    setItems(prev => prev.map(i =>
      i.id === id ? { ...i, note } : i
    ));
  };

  const clearBasket = () => {
    setItems([]);
    sessionStorage.removeItem(storageKey);
  };

  // Total of all items (fixed price items only for display)
  const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  // Fixed total - only items that are NOT price_on_request
  const fixedTotal = useMemo(() => {
    return items
      .filter(item => !item.isPriceOnRequest)
      .reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }, [items]);
  
  // Check if any item requires a quote
  const hasPriceOnRequest = useMemo(() => {
    return items.some(item => item.isPriceOnRequest);
  }, [items]);
  
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <BasketContext.Provider value={{ 
      items, 
      addItem, 
      removeItem, 
      updateQuantity,
      updateNote,
      clearBasket, 
      total,
      fixedTotal,
      hasPriceOnRequest,
      itemCount 
    }}>
      {children}
    </BasketContext.Provider>
  );
};

export const useBasket = () => {
  const context = useContext(BasketContext);
  if (!context) {
    throw new Error('useBasket must be used within BasketProvider');
  }
  return context;
};

// Aliases for new naming convention
export { BasketProvider as CartProvider };
export { useBasket as useCart };
