import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useWebPush = () => {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);

  useEffect(() => {
    // Check if Push API is supported
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);
    console.log('[Web Push] Supported:', supported);

    if (!supported) {
      console.log('[Web Push] Push notifications not supported');
      return;
    }

    // Get current permission
    const currentPermission = Notification.permission;
    setPermission(currentPermission);
    console.log('[Web Push] Current permission:', currentPermission);

    // Fetch VAPID public key
    const fetchVapidKey = async () => {
      try {
        console.log('[Web Push] Fetching VAPID key...');
        const { data, error } = await supabase.functions.invoke('get-vapid-public-key');
        console.log('[Web Push] VAPID response:', { data, error });
        if (error) throw error;
        setVapidPublicKey(data.publicKey);
        console.log('[Web Push] VAPID key fetched:', data.publicKey?.substring(0, 20) + '...');
      } catch (error) {
        console.error('[Web Push] Failed to fetch VAPID key:', error);
      }
    };

    fetchVapidKey();

    // Check if already subscribed
    const checkSubscription = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setIsSubscribed(!!subscription);
        
        if (subscription) {
          console.log('[Web Push] Already subscribed');
          // Verify subscription exists in database
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data } = await supabase
              .from('push_subscriptions')
              .select('id')
              .eq('endpoint', subscription.endpoint)
              .single();
            
            if (!data) {
              // Subscription exists in browser but not in DB - save it
              await saveSubscription(subscription);
            }
          }
        }
      } catch (error) {
        console.error('[Web Push] Error checking subscription:', error);
      }
    };

    checkSubscription();
  }, []);

  const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return new Uint8Array(outputArray);
  };

  const saveSubscription = async (subscription: PushSubscription) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const subscriptionJSON = subscription.toJSON();
    
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscriptionJSON.keys?.p256dh || '',
        auth: subscriptionJSON.keys?.auth || ''
      }, {
        onConflict: 'endpoint'
      });

    if (error) throw error;
    console.log('[Web Push] Subscription saved to database');
  };

  const subscribeToPush = async (): Promise<boolean> => {
    console.log('[Web Push] subscribeToPush called');
    console.log('[Web Push] isSupported:', isSupported);
    console.log('[Web Push] vapidPublicKey:', vapidPublicKey ? vapidPublicKey.substring(0, 20) + '...' : 'null');
    
    if (!isSupported) {
      console.error('[Web Push] Push notifications not supported');
      return false;
    }

    if (!vapidPublicKey) {
      console.error('[Web Push] VAPID public key not available');
      return false;
    }

    setIsLoading(true);

    try {
      // Request permission if not granted
      console.log('[Web Push] Current permission:', Notification.permission);
      if (Notification.permission === 'default') {
        console.log('[Web Push] Requesting permission...');
        const permissionResult = await Notification.requestPermission();
        setPermission(permissionResult);
        console.log('[Web Push] Permission result:', permissionResult);
        
        if (permissionResult !== 'granted') {
          console.log('[Web Push] Permission denied');
          return false;
        }
      }

      if (Notification.permission !== 'granted') {
        console.log('[Web Push] Permission not granted');
        return false;
      }

      // Register service worker
      console.log('[Web Push] Registering service worker...');
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      await navigator.serviceWorker.ready;
      console.log('[Web Push] Service worker registered');

      // Subscribe to push notifications
      console.log('[Web Push] Subscribing to push with VAPID key...');
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer
      });

      console.log('[Web Push] Subscribed to push notifications');
      console.log('[Web Push] Subscription endpoint:', subscription.endpoint);

      // Save subscription to database
      console.log('[Web Push] Saving subscription to database...');
      await saveSubscription(subscription);
      setIsSubscribed(true);
      console.log('[Web Push] Subscription saved successfully');
      
      return true;
    } catch (error) {
      console.error('[Web Push] Error subscribing to push:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribe = async (): Promise<void> => {
    setIsLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await subscription.unsubscribe();
        
        // Remove from database
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', subscription.endpoint);
        }
        
        console.log('[Web Push] Unsubscribed from push notifications');
      }
      
      setIsSubscribed(false);
    } catch (error) {
      console.error('[Web Push] Error unsubscribing:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    subscribeToPush,
    unsubscribe
  };
};
