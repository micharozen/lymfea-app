/**
 * Client Guest Session Hook
 * 
 * This hook manages a separate guest session for the client booking flow.
 * It uses localStorage with a different key than Supabase auth to prevent
 * session conflicts when a staff member tests the client flow.
 * 
 * Storage Keys:
 * - Staff/PWA: Uses standard Supabase auth (sb-* localStorage keys)
 * - Client: Uses branded localStorage key (see brand.storageKeys.guestSession)
 */

import { brand } from '@/config/brand';

const CLIENT_SESSION_KEY = brand.storageKeys.guestSession;

export interface ClientGuestSession {
  hotelId: string;
  createdAt: string;
  clientInfo?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    roomNumber?: string;
  };
}

export const useClientSession = () => {
  /**
   * Get the current guest session
   */
  const getSession = (): ClientGuestSession | null => {
    try {
      const stored = localStorage.getItem(CLIENT_SESSION_KEY);
      if (!stored) return null;
      return JSON.parse(stored);
    } catch {
      return null;
    }
  };

  /**
   * Create or update guest session
   */
  const setSession = (session: ClientGuestSession): void => {
    try {
      localStorage.setItem(CLIENT_SESSION_KEY, JSON.stringify(session));
    } catch (error) {
      console.error('Failed to save client session:', error);
    }
  };

  /**
   * Update client info in the session
   */
  const updateClientInfo = (clientInfo: Partial<ClientGuestSession['clientInfo']>): void => {
    const current = getSession();
    if (current) {
      setSession({
        ...current,
        clientInfo: {
          ...current.clientInfo,
          ...clientInfo,
        },
      });
    }
  };

  /**
   * Clear the guest session (after booking completion)
   */
  const clearSession = (): void => {
    try {
      localStorage.removeItem(CLIENT_SESSION_KEY);
    } catch (error) {
      console.error('Failed to clear client session:', error);
    }
  };

  /**
   * Initialize a new session for a hotel
   */
  const initSession = (hotelId: string): ClientGuestSession => {
    const session: ClientGuestSession = {
      hotelId,
      createdAt: new Date().toISOString(),
    };
    setSession(session);
    return session;
  };

  return {
    getSession,
    setSession,
    updateClientInfo,
    clearSession,
    initSession,
  };
};

/**
 * Check if we're currently in a client flow route
 */
export const isClientRoute = (pathname: string): boolean => {
  return pathname.startsWith('/client');
};

/**
 * Check if we're currently in a PWA/staff flow route
 */
export const isPwaRoute = (pathname: string): boolean => {
  return pathname.startsWith('/pwa');
};
