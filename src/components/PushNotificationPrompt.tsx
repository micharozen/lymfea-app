import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Bell, X } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';

export default function PushNotificationPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const { isSupported, permission, requestPermission } = usePushNotifications();

  useEffect(() => {
    // Show prompt only if notifications are supported and not yet decided
    const hasSeenPrompt = localStorage.getItem('push-notification-prompt-seen');
    
    if (isSupported && permission === 'default' && !hasSeenPrompt) {
      // Show after 3 seconds
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [isSupported, permission]);

  const handleAccept = async () => {
    const granted = await requestPermission();
    if (granted) {
      localStorage.setItem('push-notification-prompt-seen', 'true');
      setShowPrompt(false);
    }
  };

  const handleDecline = () => {
    localStorage.setItem('push-notification-prompt-seen', 'true');
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in slide-in-from-bottom duration-300">
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
              Activer les notifications ?
            </h3>
            <p className="text-sm text-muted-foreground">
              Recevez des alertes en temps réel pour vos nouvelles réservations, même quand l'app est fermée.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full mt-4">
            <Button
              variant="outline"
              onClick={handleDecline}
              className="flex-1"
            >
              Plus tard
            </Button>
            <Button
              onClick={handleAccept}
              className="flex-1"
            >
              Activer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
