import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
        <div className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="flex items-center gap-4 p-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/client/${hotelId}/menu`)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-semibold">Your Basket</h1>
          </div>
          <BookingProgressBar currentStep={1} totalSteps={4} />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center mb-4">
            <Trash2 className="h-12 w-12 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Your basket is empty</h2>
          <p className="text-muted-foreground mb-6">
            Add some treatments to get started
          </p>
          <Button onClick={() => navigate(`/client/${hotelId}/menu`)}>
            Browse Menu
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="flex items-center gap-4 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/client/${hotelId}/menu`)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">Your Basket</h1>
        </div>
        <BookingProgressBar currentStep={1} totalSteps={4} />
      </div>

      {/* Items List */}
      <div className="divide-y divide-border">
        {items.map(item => (
          <div key={item.id} className="p-4">
            <div className="flex gap-4 mb-3">
              {item.image && (
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground mb-1">
                  {item.name}
                </h3>
                <p className="text-sm text-muted-foreground mb-2">
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
                className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            </div>

            {/* Quantity Controls */}
            <div className="flex items-center gap-4 mb-3">
              <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                  className="h-8 w-8"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-8 text-center font-semibold">
                  {item.quantity}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  className="h-8 w-8"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleNote(item.id)}
                className="flex-1"
              >
                {expandedNotes.has(item.id) ? 'Hide Note' : 'Add a Note'}
              </Button>
            </div>

            {/* Note Field */}
            {expandedNotes.has(item.id) && (
              <Textarea
                placeholder="Special requests or notes..."
                value={item.note || ''}
                onChange={(e) => updateNote(item.id, e.target.value)}
                className="resize-none"
                rows={3}
              />
            )}
          </div>
        ))}
      </div>

      {/* Fixed Bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border p-4 space-y-4">
        <div className="flex justify-between items-center text-lg">
          <span className="font-semibold">Subtotal</span>
          <span className="font-bold">€{total.toFixed(2)}</span>
        </div>
        <Button
          onClick={() => navigate(`/client/${hotelId}/datetime`)}
          disabled={items.length === 0}
          className="w-full h-14 text-lg"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
