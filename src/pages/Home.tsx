import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import oomLogo from "@/assets/oom-monogram.svg";

const Home = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUserAndRedirect = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          // No session: show options or redirect to PWA welcome
          navigate("/pwa/welcome", { replace: true });
          return;
        }

        // Check all user roles
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id);

        const roleList = roles?.map(r => r.role) || [];
        const isHairdresser = roleList.includes('hairdresser');
        const isAdminOrConcierge = roleList.includes('admin') || roleList.includes('concierge');

        if (isHairdresser) {
          // Hairdresser: redirect to PWA
          const { data: hairdresser } = await supabase
            .from('hairdressers')
            .select('status')
            .eq('user_id', session.user.id)
            .maybeSingle();

          if (hairdresser?.status === "En attente") {
            navigate("/pwa/onboarding", { replace: true });
          } else {
            navigate("/pwa/dashboard", { replace: true });
          }
        } else if (isAdminOrConcierge) {
          // Admin or concierge: redirect to admin dashboard
          navigate("/admin", { replace: true });
        } else {
          // Unknown role: redirect to PWA welcome
          navigate("/pwa/welcome", { replace: true });
        }
      } catch (error) {
        console.error("Error checking user:", error);
        navigate("/pwa/welcome", { replace: true });
      } finally {
        setLoading(false);
      }
    };

    checkUserAndRedirect();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <div className="animate-fade-in">
          <img 
            src={oomLogo} 
            alt="OOM" 
            className="w-32 h-32"
          />
        </div>
      </div>
    );
  }

  return null;
};

export default Home;
