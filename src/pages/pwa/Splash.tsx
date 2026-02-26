import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { brand, brandLogos } from "@/config/brand";
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
          // Check if user is a therapist
          const { data: roles, error: rolesError } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', session.user.id)
            .eq('role', 'therapist')
            .maybeSingle();

          if (rolesError) {
            console.error("❌ Roles error:", rolesError);
            navigate("/pwa/welcome", { replace: true });
            return;
          }

          if (roles) {
            console.log("✅ Therapist role found, checking status...");
            const { data: therapist, error: therapistError } = await supabase
              .from('therapists')
              .select('status')
              .eq('user_id', session.user.id)
              .maybeSingle();

            if (therapistError) {
              console.error("❌ Therapist error:", therapistError);
              navigate("/pwa/welcome", { replace: true });
              return;
            }

            if (therapist) {
              console.log("✅ Therapist found, status:", therapist.status);
              if (therapist.status === "pending") {
                navigate("/pwa/onboarding", { replace: true });
              } else {
                navigate("/pwa/dashboard", { replace: true });
              }
              return;
            }
          }
        }

        // No valid session or not a therapist, show welcome screen
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
          src={brandLogos.monogram}
          alt={brand.name} 
          className="w-32 h-32"
        />
      </div>
    </div>
  );
};

export default PwaSplash;
