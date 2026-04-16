import { useEffect, useState, useCallback } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { brand, brandLogos } from "@/config/brand";

const CustomerProtectedRoute = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasCustomerRole, setHasCustomerRole] = useState<boolean | null>(null);

  const checkAuthAndRole = useCallback(async () => {
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();

      if (!currentSession?.user) {
        setLoading(false);
        return;
      }

      setSession(currentSession);
      setUser(currentSession.user);

      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', currentSession.user.id)
        .eq('role', 'user')
        .maybeSingle();

      if (roleError) {
        console.error("[CustomerProtectedRoute] Role check error:", roleError);
      }

      setHasCustomerRole(!!roleData);
    } catch (error) {
      console.error("[CustomerProtectedRoute] Error:", error);
      setHasCustomerRole(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuthAndRole();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setSession(null);
          setHasCustomerRole(null);
          setLoading(false);
        } else if (event === 'SIGNED_IN' && newSession) {
          checkAuthAndRole();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [checkAuthAndRole]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        setLoading(false);
        setHasCustomerRole(false);
      }
    }, 15000);
    return () => clearTimeout(timeout);
  }, [loading]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-white">
        <img
          src={brandLogos.primary}
          alt={brand.name}
          className="h-12 animate-pulse"
        />
      </div>
    );
  }

  if (!user || !session) {
    return <Navigate to="/portal/login" replace />;
  }

  if (hasCustomerRole === false) {
    return <Navigate to="/portal/login" replace />;
  }

  return <Outlet />;
};

export default CustomerProtectedRoute;
