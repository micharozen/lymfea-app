import { useEffect, useState, useCallback } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";

interface AdminProtectedRouteProps {
  children: React.ReactNode;
}

// Routes that only admins (or admins switched to venue_manager view) may access.
// Concierges hitting these are redirected to /admin/my-venue.
const ADMIN_ONLY_ROUTE_PATTERNS: RegExp[] = [
  /^\/admin\/places(\/|$)/,
  /^\/admin\/concierges(\/|$)/,
  /^\/admin\/admins(\/|$)/,
  /^\/admin\/finance(\/|$)/,
  /^\/admin\/analytics(\/|$)/,
  /^\/admin\/support(\/|$)/,
  /^\/admin\/schedule-alerts(\/|$)/,
  /^\/admin\/checkout-intents(\/|$)/,
];

const AdminProtectedRoute = ({ children }: AdminProtectedRouteProps) => {
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasAdminRole, setHasAdminRole] = useState<boolean | null>(null);
  const [role, setRole] = useState<"admin" | "concierge" | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const checkAuthAndRole = useCallback(async () => {
    try {
      console.log("[AdminProtectedRoute] Starting auth check...");
      
      // Get current session with timeout
      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Auth timeout')), 10000)
      );
      
      const { data: { session: currentSession } } = await Promise.race([
        sessionPromise,
        timeoutPromise
      ]) as Awaited<ReturnType<typeof supabase.auth.getSession>>;
      
      console.log("[AdminProtectedRoute] Session check complete:", !!currentSession);
      
      if (!currentSession?.user) {
        console.log("[AdminProtectedRoute] No session, redirecting to auth");
        setLoading(false);
        return;
      }

      setSession(currentSession);
      setUser(currentSession.user);

      // Check user role
      console.log("[AdminProtectedRoute] Checking user role...");
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', currentSession.user.id)
        .in('role', ['admin', 'concierge'])
        .maybeSingle();

      if (roleError) {
        console.error("[AdminProtectedRoute] Role check error:", roleError);
      }

      console.log("[AdminProtectedRoute] Role data:", roleData);
      setHasAdminRole(roleData ? true : false);
      setRole((roleData?.role as "admin" | "concierge" | undefined) ?? null);

      // Check if concierge must change password
      if (roleData?.role === 'concierge') {
        const { data: concierge } = await supabase
          .from('concierges')
          .select('must_change_password')
          .eq('user_id', currentSession.user.id)
          .maybeSingle();

        if (concierge?.must_change_password) {
          setMustChangePassword(true);
        }
      }
    } catch (error) {
      console.error("[AdminProtectedRoute] Error during auth check:", error);
      setHasAdminRole(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuthAndRole();

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        console.log("[AdminProtectedRoute] Auth state change:", event);
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setSession(null);
          setHasAdminRole(null);
          setLoading(false);
        } else if (event === 'SIGNED_IN' && newSession) {
          checkAuthAndRole();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [checkAuthAndRole]);

  // Safety timeout - if still loading after 15 seconds, something is wrong
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        console.error("[AdminProtectedRoute] Loading timeout - forcing completion");
        setLoading(false);
        setHasAdminRole(false);
      }
    }, 15000);
    
    return () => clearTimeout(timeout);
  }, [loading]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user || !session) {
    return <Navigate to="/auth" replace />;
  }

  if (mustChangePassword) {
    return <Navigate to="/update-password" replace />;
  }

  if (hasAdminRole === false) {
    return <Navigate to="/pwa/login" replace />;
  }

  if (role === "concierge") {
    const path = location.pathname;
    if (ADMIN_ONLY_ROUTE_PATTERNS.some((re) => re.test(path))) {
      return <Navigate to="/admin/my-venue" replace />;
    }
  }

  return <>{children}</>;
};

export default AdminProtectedRoute;
