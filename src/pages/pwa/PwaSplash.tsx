import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import oomLogo from "@/assets/oom-monogram.svg";
import { supabase } from "@/integrations/supabase/client";

const PwaSplash = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        // Check if user is a hairdresser
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id)
          .eq('role', 'hairdresser')
          .single();

        if (roles) {
          // Get hairdresser status
          const { data: hairdresser } = await supabase
            .from('hairdressers')
            .select('status')
            .eq('user_id', session.user.id)
            .single();

          if (hairdresser) {
            // Redirect based on status
            if (hairdresser.status === "En attente") {
              navigate("/pwa/onboarding", { replace: true });
            } else {
              navigate("/pwa/dashboard", { replace: true });
            }
            return;
          }
        }
      }
      
      // No valid session, show welcome screen after delay
      const timer = setTimeout(() => {
        navigate("/pwa/welcome");
      }, 2000);

      return () => clearTimeout(timer);
    };

    checkSession();
  }, [navigate]);

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
};

export default PwaSplash;
