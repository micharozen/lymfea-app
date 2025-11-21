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
  const [hasHairdresserRole, setHasHairdresserRole] = useState<boolean | null>(null);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Validate session with backend
  useEffect(() => {
    if (!loading && session) {
      setTimeout(() => {
        supabase.auth.getUser().then(({ error }) => {
          if (error) {
            console.warn("Session invalide, déconnexion:", error.message);
            supabase.auth.signOut();
            setUser(null);
            setSession(null);
          }
        }).catch(() => {});
      }, 0);
    }
  }, [loading, session]);

  // Check user role
  useEffect(() => {
    const checkRole = async () => {
      if (!user) {
        setHasHairdresserRole(null);
        return;
      }

      try {
        // Check if user has hairdresser role
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'hairdresser')
          .maybeSingle();

        if (error || !data) {
          console.log("No hairdresser role found or error:", error);
          setHasHairdresserRole(false);
        } else {
          console.log("Hairdresser role found!");
          setHasHairdresserRole(true);
        }
      } catch (error) {
        console.error("Erreur lors de la vérification du rôle:", error);
        setHasHairdresserRole(false);
      }
    };

    if (user) {
      checkRole();
    }
  }, [user]);

  if (loading || hasHairdresserRole === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Chargement...</div>
      </div>
    );
  }

  if (!user || !session) {
    return <Navigate to="/pwa/login" replace />;
  }

  // If user is admin/concierge, redirect to Dashboard
  if (hasHairdresserRole === false) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

export default HairdresserProtectedRoute;
