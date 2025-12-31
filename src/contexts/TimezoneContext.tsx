import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TimezoneContextType {
  /** User's saved timezone preference from profile */
  userTimezone: string;
  /** Currently active timezone for display (can be temporarily different from userTimezone) */
  activeTimezone: string;
  /** Set the active timezone for current session only */
  setActiveTimezone: (tz: string) => void;
  /** Reset active timezone back to user's saved preference */
  resetToUserTimezone: () => void;
  /** Save a new timezone preference to the user's profile */
  saveUserTimezone: (tz: string) => Promise<void>;
  /** Whether the active timezone differs from user's saved preference */
  isTemporaryTimezone: boolean;
  /** Loading state */
  isLoading: boolean;
}

const TimezoneContext = createContext<TimezoneContextType | undefined>(undefined);

const DEFAULT_TIMEZONE = 'Europe/Paris';

export function TimezoneProvider({ children }: { children: React.ReactNode }) {
  const [userTimezone, setUserTimezone] = useState<string>(DEFAULT_TIMEZONE);
  const [activeTimezone, setActiveTimezoneState] = useState<string>(DEFAULT_TIMEZONE);
  const [isLoading, setIsLoading] = useState(true);

  // Load user's timezone preference on mount
  useEffect(() => {
    const loadUserTimezone = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          // Not logged in - use browser timezone
          const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          setUserTimezone(browserTz);
          setActiveTimezoneState(browserTz);
          setIsLoading(false);
          return;
        }

        // Try to get from profiles table
        const { data: profile } = await supabase
          .from('profiles')
          .select('timezone')
          .eq('user_id', user.id)
          .single();

        if (profile?.timezone) {
          setUserTimezone(profile.timezone);
          setActiveTimezoneState(profile.timezone);
        } else {
          // No profile yet - create one with browser timezone or default
          const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const defaultTz = browserTz || DEFAULT_TIMEZONE;
          
          await supabase
            .from('profiles')
            .upsert({
              user_id: user.id,
              timezone: defaultTz,
            }, { onConflict: 'user_id' });
          
          setUserTimezone(defaultTz);
          setActiveTimezoneState(defaultTz);
        }
      } catch (error) {
        console.error('Error loading user timezone:', error);
        const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        setUserTimezone(browserTz);
        setActiveTimezoneState(browserTz);
      } finally {
        setIsLoading(false);
      }
    };

    loadUserTimezone();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadUserTimezone();
    });

    return () => subscription.unsubscribe();
  }, []);

  const setActiveTimezone = useCallback((tz: string) => {
    setActiveTimezoneState(tz);
  }, []);

  const resetToUserTimezone = useCallback(() => {
    setActiveTimezoneState(userTimezone);
  }, [userTimezone]);

  const saveUserTimezone = useCallback(async (tz: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          timezone: tz,
        }, { onConflict: 'user_id' });

      if (error) throw error;

      setUserTimezone(tz);
      setActiveTimezoneState(tz);
    } catch (error) {
      console.error('Error saving timezone:', error);
      throw error;
    }
  }, []);

  const isTemporaryTimezone = useMemo(() => 
    activeTimezone !== userTimezone, 
    [activeTimezone, userTimezone]
  );

  const value = useMemo(() => ({
    userTimezone,
    activeTimezone,
    setActiveTimezone,
    resetToUserTimezone,
    saveUserTimezone,
    isTemporaryTimezone,
    isLoading,
  }), [userTimezone, activeTimezone, setActiveTimezone, resetToUserTimezone, saveUserTimezone, isTemporaryTimezone, isLoading]);

  return (
    <TimezoneContext.Provider value={value}>
      {children}
    </TimezoneContext.Provider>
  );
}

export function useTimezone() {
  const context = useContext(TimezoneContext);
  if (context === undefined) {
    throw new Error('useTimezone must be used within a TimezoneProvider');
  }
  return context;
}
