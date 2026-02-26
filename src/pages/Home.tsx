import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { brand, brandLogos } from "@/config/brand";
import { getRoleRedirect } from "@/hooks/useRoleRedirect";

const Home = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUserAndRedirect = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          // No session: redirect to PWA welcome
          navigate("/pwa/welcome", { replace: true });
          return;
        }

        // Use centralized role redirect logic
        const { redirectPath } = await getRoleRedirect(session.user.id);
        navigate(redirectPath, { replace: true });
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
            src={brandLogos.monogram}
            alt={brand.name} 
            className="w-32 h-32"
          />
        </div>
      </div>
    );
  }

  return null;
};

export default Home;
