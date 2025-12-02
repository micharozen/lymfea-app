import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook qui capture le push token retourné par Despia dans l'URL
 * et le sauvegarde dans Supabase
 */
export const useDespiaToken = () => {
  useEffect(() => {
    const captureAndSaveToken = async () => {
      const params = new URLSearchParams(window.location.search);
      const pushToken = params.get('push_token') || params.get('onesignal_id');
      
      if (!pushToken) return;

      console.log('[Despia] Push token detected in URL:', pushToken);

      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          console.error('[Despia] No authenticated user to save token');
          return;
        }

        // Save token to push_tokens table
        const { error } = await supabase
          .from('push_tokens')
          .upsert(
            {
              user_id: user.id,
              token: pushToken,
              endpoint: 'despia', // Platform identifier
            },
            {
              onConflict: 'user_id,endpoint',
            }
          );

        if (error) {
          console.error('[Despia] Failed to save push token:', error);
        } else {
          console.log('[Despia] Push token saved successfully');
        }

        // Clean URL to remove token params
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('push_token');
        cleanUrl.searchParams.delete('onesignal_id');
        
        window.history.replaceState({}, document.title, cleanUrl.toString());
        console.log('[Despia] URL cleaned');

      } catch (error) {
        console.error('[Despia] Error processing push token:', error);
      }
    };

    captureAndSaveToken();
  }, []);
};
