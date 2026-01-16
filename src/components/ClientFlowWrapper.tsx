/**
 * Client Flow Wrapper
 * 
 * This wrapper ensures that the client booking flow operates independently
 * from the staff/PWA auth session. When a staff member visits the client
 * flow, their Supabase session remains untouched.
 * 
 * Key behaviors:
 * 1. Initializes a guest session for the hotel
 * 2. Does NOT check or modify Supabase auth state
 * 3. Preserves staff session when they navigate back to /pwa
 */

import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useClientSession } from '@/hooks/useClientSession';
import { ClientFlowProvider } from '@/pages/client/context/ClientFlowContext';

interface ClientFlowWrapperProps {
  children: React.ReactNode;
}

export const ClientFlowWrapper = ({ children }: ClientFlowWrapperProps) => {
  const { hotelId } = useParams<{ hotelId: string }>();
  const { getSession, initSession } = useClientSession();

  useEffect(() => {
    if (!hotelId) return;

    // Check if we already have a session for this hotel
    const existingSession = getSession();
    
    // Only initialize if no session exists or it's for a different hotel
    if (!existingSession || existingSession.hotelId !== hotelId) {
      initSession(hotelId);
    }
  }, [hotelId]);

  return (
    <ClientFlowProvider>
      <div className="lymfea-client">{children}</div>
    </ClientFlowProvider>
  );
};

export default ClientFlowWrapper;
