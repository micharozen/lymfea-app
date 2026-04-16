import { useEffect, useState } from 'react';
import { useClientFlow } from '@/pages/client/context/FlowContext';
import { useTranslation } from 'react-i18next';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

export function HoldBanner() {
  const { holdExpiresAt, clearFlow } = useClientFlow();
  const { t } = useTranslation('client');
  const navigate = useNavigate();
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!holdExpiresAt) {
      setTimeLeft(null);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((holdExpiresAt - now) / 1000));
      setTimeLeft(remaining);

      if (remaining === 0) {
        clearInterval(interval);
        clearFlow();
        navigate(window.location.pathname.split('/guest-info')[0].split('/checkout')[0], {
          state: { slotTaken: true }
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [holdExpiresAt, clearFlow, navigate]);

  if (!holdExpiresAt || timeLeft === null) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const isUrgent = timeLeft < 60;

  return (
    <div className={cn(
      "sticky top-0 z-50 w-full px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-sm transition-colors duration-300",
      isUrgent ? "bg-red-600 text-white animate-pulse" : "bg-amber-50 text-amber-800 border-b border-amber-200"
    )}>
      <AlertCircle className="w-4 h-4" />
      <span>
        {t('datetime.slotHeld', 'Créneau réservé pour vous pendant')} : {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
    </div>
  );
}