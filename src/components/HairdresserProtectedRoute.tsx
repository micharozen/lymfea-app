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

    // SAFETY TIMEOUT: Force stop loading after 5 seconds
    const safetyTimeout = setTimeout(() => {
      console.warn("⚠️ SAFETY TIMEOUT: Forcing loading to stop");
      if (mounted) {
        setLoading(false);
      }
    }, 5000);

    const initAuth = async () => {
      try {
        console.log("🔐 Starting auth check");
        
        // Try to refresh session first if it exists
        const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError) {
          console.log("Session refresh failed:", refreshError.message);
        }
        
        // Get current session (either refreshed or existing)
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          console.log("No session found");
          if (mounted) {
            setLoading(false);
          }
          return;
        }

        console.log("✅ Session found, expires at:", new Date(session.expires_at! * 1000).toLocaleString());
        
        if (mounted) {
          setSession(session);
          setUser(session.user);
        }

        // Check hairdresser role
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id)
          .eq('role', 'hairdresser')
          .maybeSingle();

        const hasRole = !!roleData;
        console.log("Has hairdresser role:", hasRole);

        if (mounted) {
          setIsHairdresser(hasRole);
          setLoading(false);
          clearTimeout(safetyTimeout);
        }
      } catch (error) {
        console.error("Auth error:", error);
        if (mounted) {
          setLoading(false);
          clearTimeout(safetyTimeout);
        }
      }
    };

    initAuth();

    // Set up auth listener for real-time changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        console.log("🔄 Auth state changed:", event);
        
        // Ignore TOKEN_REFRESHED events - they don't change the user
        if (event === 'TOKEN_REFRESHED') {
          console.log("✅ Session refreshed successfully");
          return;
        }
        
        if (mounted) {
          setSession(newSession);
          setUser(newSession?.user ?? null);
          
          // Re-check role only on meaningful auth changes
          if (newSession && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
            setTimeout(async () => {
              const { data: roleData } = await supabase
                .from('user_roles')
                .select('role')
                .eq('user_id', newSession.user.id)
                .eq('role', 'hairdresser')
                .maybeSingle();
              
              if (mounted) {
                setIsHairdresser(!!roleData);
              }
            }, 0);
          } else if (!newSession) {
            setIsHairdresser(false);
          }
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  console.log("📊 Current state:", { loading, user: !!user, session: !!session, isHairdresser });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-lg">Chargement...</div>
      </div>
    );
  }

  if (!user || !session) {
    console.log("➡️ Redirecting to /pwa/login (no session)");
    return <Navigate to="/pwa/login" replace />;
  }

  if (!isHairdresser) {
    console.log("➡️ Redirecting to /auth (not hairdresser)");
    return <Navigate to="/auth" replace />;
  }

  console.log("✅ Rendering protected content");
  return <>{children}</>;
};

export default HairdresserProtectedRoute;
