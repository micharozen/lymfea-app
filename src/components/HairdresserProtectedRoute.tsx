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
        
        // Get current session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          console.log("No session");
          if (mounted) {
            setLoading(false);
          }
          return;
        }

        console.log("✅ Session found");
        
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
        console.log("Has role:", hasRole);

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

    // Set up auth listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
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
