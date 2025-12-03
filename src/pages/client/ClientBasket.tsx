import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Minus, Plus, Trash2 } from 'lucide-react';
import { useBasket } from './context/BasketContext';
import { useState } from 'react';
import BookingProgressBar from '@/components/BookingProgressBar';

export default function ClientBasket() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();
  const { items, updateQuantity, removeItem, updateNote, total } = useBasket();
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const { t } = useTranslation('client');

  const toggleNote = (id: string) => {
    setExpandedNotes(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="sticky top-0 z-10 bg-background border-b border-border pt-safe">
          <div className="flex items-center gap-4 p-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/client/${hotelId}/menu`)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-semibold">{t('basket.title')}</h1>
          </div>
          <BookingProgressBar currentStep={1} totalSteps={4} />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
            <Trash2 className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">{t('basket.empty')}</h2>
          <p className="text-muted-foreground mb-6 text-sm">
            {t('menu.noTreatments')}
          </p>
          <Button onClick={() => navigate(`/client/${hotelId}/menu`)} className="rounded-full">
            {t('basket.browse')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-36">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border pt-safe">
        <div className="flex items-center gap-4 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/client/${hotelId}/menu`)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">{t('basket.title')}</h1>
        </div>
        <BookingProgressBar currentStep={1} totalSteps={4} />
      </div>

      {/* Items List */}
      <div className="divide-y divide-border">
        {items.map(item => (
          <div key={item.id} className="p-4">
            <div className="flex gap-3 mb-3">
              {item.image && (
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground mb-1 text-sm">
                  {item.name}
                </h3>
                <p className="text-xs text-muted-foreground mb-1">
                  {item.category} • {item.duration} min
                </p>
                <p className="font-semibold text-foreground">
                  €{(item.price * item.quantity).toFixed(2)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeItem(item.id)}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0 h-8 w-8"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Quantity Controls */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-muted rounded-full p-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                  className="h-8 w-8 rounded-full"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-8 text-center font-semibold text-sm">
                  {item.quantity}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  className="h-8 w-8 rounded-full"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleNote(item.id)}
                className="flex-1 rounded-full text-xs"
              >
                {expandedNotes.has(item.id) ? t('common:buttons.close') : t('basket.addNote')}
              </Button>
            </div>

            {/* Note Field */}
            {expandedNotes.has(item.id) && (
              <Textarea
                placeholder={t('basket.notePlaceholder')}
                value={item.note || ''}
                onChange={(e) => updateNote(item.id, e.target.value)}
                className="resize-none mt-3 text-sm"
                rows={2}
              />
            )}
          </div>
        ))}
      </div>

      {/* Fixed Bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border p-4 space-y-3 pb-safe">
        <div className="flex justify-between items-center">
          <span className="font-semibold">{t('basket.subtotal')}</span>
          <span className="font-bold text-lg">€{total.toFixed(2)}</span>
        </div>
        <Button
          onClick={() => navigate(`/client/${hotelId}/datetime`)}
          disabled={items.length === 0}
          className="w-full h-14 text-base rounded-full"
        >
          {t('basket.continue')}
        </Button>
      </div>
    </div>
  );
}
