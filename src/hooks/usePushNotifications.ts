import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// VAPID public key (generated for this project)
const VAPID_PUBLIC_KEY = 'BJ5Qp7YsNV9wEid7H3Hv_RcjBUmfgr7QwjQOilnv19G7Cz2VlQVfgOYcYSqYEqugzGpRFogqelULhE4zkAth7Ns';

export const usePushNotifications = () => {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkExistingSubscription = async () => {
      try {
        // Check if browser supports notifications
        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
          console.log('[Push] Browser does not support notifications or service workers');
          setIsLoading(false);
          return;
        }
        
        setIsSupported(true);
        setPermission(Notification.permission);
        
        console.log('[Push] Current permission:', Notification.permission);
        
        // If permission is granted, check for existing subscription
        if (Notification.permission === 'granted') {
          try {
            const registration = await navigator.serviceWorker.ready;
            console.log('[Push] Service worker ready');
            
            const subscription = await registration.pushManager.getSubscription();
            console.log('[Push] Current subscription:', subscription ? 'exists' : 'none');
            
            if (subscription) {
              // Verify subscription exists in database
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                console.log('[Push] Checking DB for user:', user.id);
                
                const { data: existingToken } = await supabase
                  .from('push_tokens')
                  .select('id')
                  .eq('user_id', user.id)
                  .eq('endpoint', subscription.endpoint)
                  .maybeSingle();
                
                if (existingToken) {
                  setIsSubscribed(true);
                  console.log('[Push] ✅ Subscription found in DB');
                } else {
                  // Subscription exists in browser but not in DB - re-save it
                  console.log('[Push] 💾 Saving subscription to DB...');
                  const { error } = await supabase
                    .from('push_tokens')
                    .upsert({
                      user_id: user.id,
                      token: JSON.stringify(subscription.toJSON()),
                      endpoint: subscription.endpoint,
                    }, {
                      onConflict: 'user_id,endpoint',
                    });
                  
                  if (!error) {
                    setIsSubscribed(true);
                    console.log('[Push] ✅ Subscription saved to DB');
                  } else {
                    console.error('[Push] ❌ Error saving to DB:', error);
                  }
                }
              }
            }
          } catch (error) {
            console.error('[Push] Error checking existing subscription:', error);
          }
        }
      } finally {
        setIsLoading(false);
      }
    };
    
    checkExistingSubscription();
  }, []);

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const requestPermission = async () => {
    if (!isSupported) {
      toast.error('Les notifications ne sont pas supportées sur ce navigateur');
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === 'granted') {
        await subscribeToPush();
        return true;
      } else {
        toast.error('Permission de notification refusée');
        return false;
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      toast.error('Erreur lors de la demande de permission');
      return false;
    }
  };

  const subscribeToPush = async () => {
    try {
      console.log('[Push] 🔔 Starting subscription process...');
      const registration = await navigator.serviceWorker.ready;
      console.log('[Push] Service worker ready');
      
      // Check if already subscribed
      let subscription = await registration.pushManager.getSubscription();
      console.log('[Push] Current subscription:', subscription ? 'exists' : 'none');
      
      if (!subscription) {
        // Subscribe to push notifications
        console.log('[Push] Creating new subscription...');
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        console.log('[Push] ✅ New subscription created');
      }

      // Save subscription to database
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      console.log('[Push] 💾 Saving to database for user:', user.id);
      const subscriptionData = {
        user_id: user.id,
        token: JSON.stringify(subscription.toJSON()),
        endpoint: subscription.endpoint,
      };
      console.log('[Push] Subscription data:', subscriptionData);

      const { error } = await supabase
        .from('push_tokens')
        .upsert(subscriptionData, {
          onConflict: 'user_id,endpoint',
        });

      if (error) {
        console.error('[Push] ❌ Error saving to DB:', error);
        throw error;
      }

      setIsSubscribed(true);
      toast.success('Notifications activées !');
      console.log('[Push] ✅ Subscription saved successfully');
    } catch (error) {
      console.error('[Push] ❌ Error subscribing to push:', error);
      toast.error('Erreur lors de l\'activation des notifications');
      setIsSubscribed(false);
    }
  };

  const unsubscribe = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await subscription.unsubscribe();
        
        // Remove from database
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from('push_tokens')
            .delete()
            .eq('user_id', user.id)
            .eq('endpoint', subscription.endpoint);
        }
      }

      setIsSubscribed(false);
      toast.success('Notifications désactivées');
    } catch (error) {
      console.error('Error unsubscribing from push:', error);
      toast.error('Erreur lors de la désactivation');
    }
  };

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    requestPermission,
    unsubscribe,
  };
};
