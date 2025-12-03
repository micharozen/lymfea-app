import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";

interface HairdresserProtectedRouteProps {
  children: React.ReactNode;
}

const HairdresserProtectedRoute = ({ children }: HairdresserProtectedRouteProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isHairdresser, setIsHairdresser] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    let initialized = false;

    // SAFETY TIMEOUT: Force stop loading after 5 seconds
    const safetyTimeout = setTimeout(() => {
      if (mounted && !initialized) {
        console.warn("⚠️ SAFETY TIMEOUT: Forcing loading to stop");
        setLoading(false);
      }
    }, 5000);

    const checkHairdresserRole = async (userId: string) => {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'hairdresser')
        .maybeSingle();
      return !!roleData;
    };

    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!mounted) return;
        
        if (!session) {
          setLoading(false);
          initialized = true;
          clearTimeout(safetyTimeout);
          return;
        }

        setSession(session);
        setUser(session.user);

        const hasRole = await checkHairdresserRole(session.user.id);
        
        if (mounted) {
          setIsHairdresser(hasRole);
          setLoading(false);
          initialized = true;
          clearTimeout(safetyTimeout);
        }
      } catch (error) {
        console.error("Auth error:", error);
        if (mounted) {
          setLoading(false);
          initialized = true;
          clearTimeout(safetyTimeout);
        }
      }
    };

    // Set up auth listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        // Ignore token refresh and initial session (handled by initAuth)
        if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          return;
        }
        
        if (!mounted) return;
        
        setSession(newSession);
        setUser(newSession?.user ?? null);
        
        if (newSession && event === 'SIGNED_IN') {
          setTimeout(async () => {
            if (!mounted) return;
            const hasRole = await checkHairdresserRole(newSession.user.id);
            if (mounted) {
              setIsHairdresser(hasRole);
            }
          }, 0);
        } else if (!newSession) {
          setIsHairdresser(false);
        }
      }
    );

    // Then initialize
    initAuth();

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-lg">Chargement...</div>
      </div>
    );
  }

  if (!user || !session) {
    return <Navigate to="/pwa/login" replace />;
  }

  if (!isHairdresser) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

export default HairdresserProtectedRoute;
