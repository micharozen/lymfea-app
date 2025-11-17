import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import oomLogo from "@/assets/oom-monogram.svg";

const PwaSplash = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Auto-redirect after 2 seconds
    const timer = setTimeout(() => {
      navigate("/pwa/welcome");
    }, 2000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center">
      <div className="animate-fade-in">
        <img 
          src={oomLogo} 
          alt="OOM" 
          className="w-32 h-32 mb-8"
        />
        <div className="text-white text-center">
          <div className="w-16 h-1 bg-white mx-auto animate-pulse" />
        </div>
      </div>
    </div>
  );
};

export default PwaSplash;
