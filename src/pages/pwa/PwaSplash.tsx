import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import oomLogo from "@/assets/oom-monogram.svg";
import { supabase } from "@/integrations/supabase/client";

const PwaSplash = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      try {
        console.log("🔍 Checking session...");
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error("❌ Session error:", sessionError);
          navigate("/pwa/welcome", { replace: true });
          return;
        }
        
        if (session) {
          console.log("✅ Session found, checking roles...");
          // Check if user is a hairdresser
          const { data: roles, error: rolesError } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', session.user.id)
            .eq('role', 'hairdresser')
            .maybeSingle();

          if (rolesError) {
            console.error("❌ Roles error:", rolesError);
            navigate("/pwa/welcome", { replace: true });
            return;
          }

          if (roles) {
            console.log("✅ Hairdresser role found, checking status...");
            // Get hairdresser status
            const { data: hairdresser, error: hairdresserError } = await supabase
              .from('hairdressers')
              .select('status')
              .eq('user_id', session.user.id)
              .maybeSingle();

            if (hairdresserError) {
              console.error("❌ Hairdresser error:", hairdresserError);
              navigate("/pwa/welcome", { replace: true });
              return;
            }

            if (hairdresser) {
              console.log("✅ Hairdresser found, status:", hairdresser.status);
              // Redirect based on status
              if (hairdresser.status === "pending") {
                navigate("/pwa/onboarding", { replace: true });
              } else {
                navigate("/pwa/dashboard", { replace: true });
              }
              return;
            }
          }
        }
        
        // No valid session or not a hairdresser, show welcome screen
        console.log("ℹ️ No valid session, redirecting to welcome");
        navigate("/pwa/welcome", { replace: true });
      } catch (error) {
        console.error("❌ Error checking session:", error);
        // On error, redirect to welcome
        navigate("/pwa/welcome", { replace: true });
      }
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
