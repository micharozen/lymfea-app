import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const PwaWelcomeFlow = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
      <div className="text-center space-y-8 max-w-md">
        {/* Logo */}
        <h1 className="text-white text-4xl font-bold tracking-[0.3em] mb-8">
          OOM
        </h1>

        {/* Title */}
        <div className="space-y-2">
          <h2 className="text-white text-2xl font-light">
            Reviewing and
          </h2>
          <h2 className="text-white text-2xl font-light">
            Accepting order
          </h2>
        </div>

        {/* Flow Button */}
        <Button
          onClick={() => navigate("/pwa/dashboard")}
          className="bg-white text-black hover:bg-gray-100 rounded-full px-8 py-6 text-base font-medium mt-12"
        >
          FLOW
        </Button>
      </div>
    </div>
  );
};

export default PwaWelcomeFlow;
