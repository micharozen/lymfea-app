import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';
import { useBasket } from '@/pages/client/context/CartContext';
import { formatPrice } from '@/lib/formatPrice';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';

interface CartDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOffert?: boolean;
  isCompanyOffered?: boolean;
}

export function CartDrawer({ open, onOpenChange, isOffert = false, isCompanyOffered = false }: CartDrawerProps) {
  const { items, updateQuantity, removeItem, total } = useBasket();
  const { t } = useTranslation('client');

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85dvh] bg-white">
        <DrawerHeader className="text-left border-b border-gray-100 pb-4">
          <DrawerTitle className="font-serif text-xl text-gray-900">
            {t('basket.title')}
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            {t('basket.title')}
          </DrawerDescription>
        </DrawerHeader>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-8 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <ShoppingBag className="h-8 w-8 text-gray-300" />
            </div>
            <p className="text-sm text-gray-400 font-light">{t('basket.empty')}</p>
          </div>
        ) : (
          <>
            <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
              {items.map(item => (
                <div key={item.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm text-gray-900 leading-tight">
                        {item.name}
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {item.category} • {item.duration} min
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(item.id)}
                      className="text-gray-300 hover:text-red-500 hover:bg-red-50 flex-shrink-0 h-8 w-8"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1 bg-gray-100 rounded-md p-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="h-7 w-7 hover:bg-gray-200 text-gray-500"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-6 text-center font-medium text-sm text-gray-900">
                        {item.quantity}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="h-7 w-7 bg-gold-400 text-black hover:bg-gold-300"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                      {isCompanyOffered ? (
                        <span className="text-xs text-gray-400 font-light">
                          {item.duration} min
                        </span>
                      ) : isOffert ? (
                        <span className="inline-flex items-baseline gap-1">
                          <span className="text-xs text-gray-400 line-through font-light">
                            {item.isPriceOnRequest ? t('payment.onQuote') : formatPrice(item.price * item.quantity, item.currency || 'EUR', { decimals: 0 })}
                          </span>
                          <span className="text-sm font-medium text-emerald-600">
                            {formatPrice(0, item.currency || 'EUR', { decimals: 0 })}
                          </span>
                        </span>
                      ) : item.isPriceOnRequest
                        ? t('payment.onQuote')
                        : formatPrice(item.price * item.quantity, item.currency || 'EUR', { decimals: 0 })}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {!isCompanyOffered && (
              <div className="border-t border-gray-200 px-4 py-4 pb-safe">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-500">{t('basket.subtotal')}</span>
                  <span className="text-lg font-semibold text-gray-900">
                    {isOffert ? (
                      <span className="inline-flex items-baseline gap-1.5">
                        <span className="text-sm text-gray-400 line-through font-light">
                          {formatPrice(total, items[0]?.currency || 'EUR', { decimals: 0 })}
                        </span>
                        <span className="text-lg font-semibold text-emerald-600">
                          {formatPrice(0, items[0]?.currency || 'EUR', { decimals: 0 })}
                        </span>
                      </span>
                    ) : formatPrice(total, items[0]?.currency || 'EUR', { decimals: 0 })}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
