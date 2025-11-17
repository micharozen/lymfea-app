import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import oomLogo from "@/assets/oom-monogram.svg";
import welcomeBg from "@/assets/welcome-bg.png";

const PwaWelcome = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${welcomeBg})`,
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/60" />
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col justify-between p-6 text-white">
        {/* Top Logo */}
        <div className="pt-12 flex justify-center">
          <img 
            src={oomLogo} 
            alt="OOM" 
            className="w-16 h-16"
          />
        </div>

        {/* Bottom Content */}
        <div className="pb-8 space-y-6">
          <div className="space-y-3">
            <h1 className="text-4xl font-bold leading-tight">
              Beauty Room Service
            </h1>
            <p className="text-base text-white/90 leading-relaxed">
              Offer a luxury hair and beauty treatment in their room directly, to client rooms. A unique concept.
            </p>
          </div>

          <Button
            onClick={() => navigate("/pwa/login")}
            className="w-full h-14 text-base bg-white text-black hover:bg-white/90 font-medium rounded-full"
            size="lg"
          >
            Get Started
          </Button>

          <p className="text-xs text-center text-white/70 px-4">
            By continuing, you agree to our <span className="underline">Terms of Use</span> and <span className="underline">Privacy Policy</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default PwaWelcome;
