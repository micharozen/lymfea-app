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

    const initAuth = async () => {
      try {
        console.log("🔐 HairdresserProtectedRoute: Starting auth check");
        
        // Get current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error("❌ Session error:", sessionError);
          if (mounted) {
            setLoading(false);
          }
          return;
        }

        if (!session) {
          console.log("❌ No session found");
          if (mounted) {
            setSession(null);
            setUser(null);
            setLoading(false);
          }
          return;
        }

        console.log("✅ Session found for user:", session.user.email);
        
        if (mounted) {
          setSession(session);
          setUser(session.user);
        }

        // Check hairdresser role
        console.log("🔍 Checking hairdresser role...");
        const { data: roleData, error: roleError } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id)
          .eq('role', 'hairdresser')
          .maybeSingle();

        if (roleError) {
          console.error("❌ Role check error:", roleError);
        }

        const hasRole = !!roleData;
        console.log("✅ Has hairdresser role:", hasRole);

        if (mounted) {
          setIsHairdresser(hasRole);
          setLoading(false);
        }
      } catch (error) {
        console.error("❌ Init auth error:", error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initAuth();

    // Set up auth listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log("🔄 Auth state changed:", event);
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
          if (!session) {
            setLoading(false);
          }
        }
      }
    );

    return () => {
      mounted = false;
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
