import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ShoppingBag } from 'lucide-react';
import { useBasket } from './context/CartContext';
import { useClientVenue } from './context/ClientVenueContext';
import { CartDrawer } from '@/components/client/CartDrawer';
import { useState, useEffect } from 'react';
import { ProgressBar } from '@/components/client/ProgressBar';
import { SchedulePanel } from '@/components/client/SchedulePanel';

export default function Schedule() {
  const { slug, hotelId } = useClientVenue();
  const navigate = useNavigate();
  const location = useLocation();
  const { itemCount } = useBasket();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { t } = useTranslation('client');

  const takenDate = (location.state as any)?.takenDate as string | undefined;
  const slotTaken = !!(location.state as any)?.slotTaken;
  const sessionExpired = !!(location.state as any)?.sessionExpired;

  // Clear navigation state to avoid re-triggering on re-render
  useEffect(() => {
    if ((location.state as any)?.slotTaken || (location.state as any)?.sessionExpired) {
      window.history.replaceState({}, '');
    }
  }, []);

  return (
    <div className="relative min-h-[100dvh] w-full bg-white pb-safe">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-200 pt-safe">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="text-gray-900 hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-light text-gray-900">{t('datetime.title')}</h1>
          </div>
          {itemCount > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCartOpen(true)}
              className="relative text-gray-900 hover:bg-gray-100 hover:text-gold-600 transition-colors"
            >
              <ShoppingBag className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 bg-gold-600 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                {itemCount}
              </span>
            </Button>
          )}
        </div>
        <ProgressBar currentStep="schedule" />
      </div>

      {/* Schedule content — reusable panel */}
      <SchedulePanel
        hotelId={hotelId!}
        onContinue={() => navigate(`/client/${slug}/guest-info`)}
        takenDate={takenDate}
        slotTaken={slotTaken}
        sessionExpired={sessionExpired}
        embedded={false}
      />

      {/* Cart Drawer */}
      <CartDrawer open={isCartOpen} onOpenChange={setIsCartOpen} />
    </div>
  );
}
