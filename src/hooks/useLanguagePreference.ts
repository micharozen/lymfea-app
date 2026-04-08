import { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook that syncs the user's language preference between i18n and the profiles table.
 *
 * On mount (when authenticated): fetches profiles.language and applies it via i18n.changeLanguage().
 * Exposes saveLanguage() for persisting a new language choice.
 *
 * Falls back to existing localStorage detection when:
 * - User is not authenticated
 * - Profile has no language set (NULL)
 * - Network/DB errors occur
 */
export function useLanguagePreference() {
  const { i18n } = useTranslation();
  const hasApplied = useRef(false);

  useEffect(() => {
    const loadLanguage = async () => {
      // Don't interfere with client flow language detection
      if (window.location.pathname.startsWith('/client/')) return;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('language')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profile?.language && !hasApplied.current) {
          if (i18n.language !== profile.language) {
            await i18n.changeLanguage(profile.language);
          }
          hasApplied.current = true;
        }
      } catch (error) {
        console.error('Error loading language preference:', error);
      }
    };

    loadLanguage();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        hasApplied.current = false;
        loadLanguage();
      }
      if (event === 'SIGNED_OUT') {
        hasApplied.current = false;
      }
    });

    return () => subscription.unsubscribe();
  }, [i18n]);

  const saveLanguage = useCallback(async (langCode: string) => {
    // Always update i18n first (also persists to localStorage via LanguageDetector)
    await i18n.changeLanguage(langCode);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('profiles')
        .upsert(
          { user_id: user.id, language: langCode },
          { onConflict: 'user_id' }
        );
    } catch (error) {
      console.error('Error saving language preference:', error);
    }
  }, [i18n]);

  return { saveLanguage };
}
