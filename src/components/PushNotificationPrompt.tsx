import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Bell, X } from 'lucide-react';
import { oneSignalSubscribe, isOneSignalSubscribed, isOneSignalReady } from '@/hooks/useOneSignal';

export default function PushNotificationPrompt() {
  const { t } = useTranslation('pwa');
  const [showPrompt, setShowPrompt] = useState(false);
  const checkedRef = useRef(false);

  useEffect(() => {
    // Prevent double execution (React StrictMode)
    if (checkedRef.current) return;
    checkedRef.current = true;

    const checkAndShowPrompt = async () => {
      const hasSeenPrompt = localStorage.getItem('push-notification-prompt-seen');
      
      // Don't show if already seen
      if (hasSeenPrompt) return;

      // Wait for OneSignal to be ready (max 5 seconds)
      let attempts = 0;
      while (!isOneSignalReady() && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      // Check if already subscribed
      if (isOneSignalSubscribed()) {
        localStorage.setItem('push-notification-prompt-seen', 'true');
        return;
      }

      // Show prompt after 3 seconds
      setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
    };

    checkAndShowPrompt();
  }, []);

  const handleAccept = async () => {
    setShowPrompt(false);
    localStorage.setItem('push-notification-prompt-seen', 'true');
    await oneSignalSubscribe();
  };

  const handleDecline = () => {
    localStorage.setItem('push-notification-prompt-seen', 'true');
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in slide-in-from-bottom duration-300 relative">
        <button
          onClick={handleDecline}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Bell className="w-8 h-8 text-primary" />
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-2">
              {t('notifications.enablePromptTitle')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t('notifications.enablePromptDesc')}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full mt-4">
            <Button
              variant="outline"
              onClick={handleDecline}
              className="flex-1"
            >
              {t('notifications.enablePromptLater')}
            </Button>
            <Button
              onClick={handleAccept}
              className="flex-1"
            >
              {t('notifications.enablePromptButton')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}