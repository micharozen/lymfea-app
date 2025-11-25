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
    const checkAuthAndRole = async () => {
      try {
        // Get current session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.user) {
          setLoading(false);
          return;
        }

        setSession(session);
        setUser(session.user);

        // Check user role
        const { data: roleData, error: roleError } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id)
          .in('role', ['admin', 'concierge'])
          .maybeSingle();

        setHasAdminRole(roleData ? true : false);
      } catch (error) {
        console.error("Erreur lors de la vérification:", error);
        setHasAdminRole(false);
      } finally {
        setLoading(false);
      }
    };

    checkAuthAndRole();

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setSession(null);
          setHasAdminRole(null);
        } else if (event === 'SIGNED_IN' && session) {
          checkAuthAndRole();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);


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

  if (hasAdminRole === false) {
    return <Navigate to="/pwa/login" replace />;
  }

  return <>{children}</>;
};

export default AdminProtectedRoute;
