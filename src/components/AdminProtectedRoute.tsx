import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";

interface AdminProtectedRouteProps {
  children: React.ReactNode;
}

const AdminProtectedRoute = ({ children }: AdminProtectedRouteProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasAdminRole, setHasAdminRole] = useState<boolean | null>(null);

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
        setHasAdminRole(null);
        return;
      }

      try {
        // Check if user has admin or concierge role
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .in('role', ['admin', 'concierge'])
          .single();

        if (error || !data) {
          setHasAdminRole(false);
        } else {
          setHasAdminRole(true);
        }
      } catch (error) {
        console.error("Erreur lors de la vérification du rôle:", error);
        setHasAdminRole(false);
      }
    };

    if (user) {
      checkRole();
    }
  }, [user]);

  if (loading || hasAdminRole === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Chargement...</div>
      </div>
    );
  }

  if (!user || !session) {
    return <Navigate to="/auth" replace />;
  }

  // If user is hairdresser, redirect to PWA
  if (hasAdminRole === false) {
    return <Navigate to="/pwa/login" replace />;
  }

  return <>{children}</>;
};

export default AdminProtectedRoute;
