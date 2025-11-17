import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

const PwaLogin = () => {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [countryCode] = useState("+33");

  const handleSendOtp = async () => {
    if (!phone || phone.length < 9) {
      toast.error("Veuillez entrer un numéro de téléphone valide");
      return;
    }

    setLoading(true);
    try {
      // TODO: Implement OTP sending logic
      setStep("otp");
      toast.success("Un code de vérification a été envoyé");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length < 6) {
      toast.error("Veuillez entrer le code de vérification");
      return;
    }

    setLoading(true);
    try {
      // TODO: Implement OTP verification
      navigate("/pwa/onboarding");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="p-4">
        <button onClick={() => step === "otp" ? setStep("phone") : navigate("/pwa/welcome")}>
          <ArrowLeft className="h-6 w-6" />
        </button>
      </div>

      <div className="flex-1 flex flex-col px-6 pt-8">
        {step === "phone" ? (
          <>
            <h1 className="text-2xl font-semibold mb-2">Enter your Phone Number</h1>
            <p className="text-sm text-gray-500 mb-8">We will send you a verification code</p>

            <div className="flex items-center gap-3 mb-8">
              <div className="w-20 h-12 rounded-lg border border-gray-300 flex items-center justify-center text-sm">
                {countryCode}
              </div>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="6 40 50 18 49"
                className="flex-1 h-12 rounded-lg border border-gray-300 text-lg"
              />
            </div>

            <Button
              onClick={handleSendOtp}
              disabled={phone.length < 9 || loading}
              className={`w-full h-12 rounded-full mb-8 ${
                phone.length >= 9
                  ? "bg-black text-white hover:bg-black/90"
                  : "bg-gray-200 text-gray-400"
              }`}
            >
              Continue with Phone
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold mb-2">Enter the code</h1>
            <p className="text-sm text-gray-500 mb-8">We sent a SMS to ***{phone.slice(-4)}</p>

            <div className="flex justify-center mb-4">
              <Input
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                className="w-24 h-20 rounded-lg border-2 border-blue-500 text-center text-2xl font-semibold"
              />
            </div>
            <p className="text-xs text-center text-gray-400 mb-8">
              Didn't receive code ? / Send again in 01:31
            </p>

            <Button
              onClick={handleVerifyOtp}
              disabled={otp.length < 6 || loading}
              className={`w-full h-12 rounded-full mb-8 ${
                otp.length >= 6
                  ? "bg-black text-white hover:bg-black/90"
                  : "bg-gray-200 text-gray-400"
              }`}
            >
              Continue with Phone
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default PwaLogin;
