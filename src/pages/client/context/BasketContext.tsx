import React, { createContext, useContext, useEffect, useState } from 'react';

export interface BasketItem {
  id: string;
  name: string;
  price: number;
  duration: number;
  quantity: number;
  note?: string;
  image?: string;
  category: string;
}

interface BasketContextType {
  items: BasketItem[];
  addItem: (item: Omit<BasketItem, 'quantity' | 'note'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  updateNote: (id: string, note: string) => void;
  clearBasket: () => void;
  total: number;
  itemCount: number;
}

const BasketContext = createContext<BasketContextType | undefined>(undefined);

export const BasketProvider: React.FC<{ children: React.ReactNode; hotelId: string }> = ({ 
  children, 
  hotelId 
}) => {
  const storageKey = `basket_${hotelId}`;
  
  const [items, setItems] = useState<BasketItem[]>(() => {
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : [];
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(items));
  }, [items, storageKey]);

  const addItem = (item: Omit<BasketItem, 'quantity' | 'note'>) => {
    setItems(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => 
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(id);
      return;
    }
    setItems(prev => prev.map(i => 
      i.id === id ? { ...i, quantity } : i
    ));
  };

  const updateNote = (id: string, note: string) => {
    setItems(prev => prev.map(i => 
      i.id === id ? { ...i, note } : i
    ));
  };

  const clearBasket = () => {
    setItems([]);
    localStorage.removeItem(storageKey);
  };

  const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
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
