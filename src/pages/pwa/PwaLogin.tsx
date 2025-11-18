import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, Check, ChevronsUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const countryCodes = [
  { code: "+33", name: "France", flag: "🇫🇷" },
  { code: "+971", name: "United Arab Emirates", flag: "🇦🇪" },
  { code: "+1", name: "United States", flag: "🇺🇸" },
  { code: "+44", name: "United Kingdom", flag: "🇬🇧" },
  { code: "+34", name: "Spain", flag: "🇪🇸" },
  { code: "+39", name: "Italy", flag: "🇮🇹" },
  { code: "+49", name: "Germany", flag: "🇩🇪" },
];

const PwaLogin = () => {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [countryCode, setCountryCode] = useState("+33");
  const [openCountrySelect, setOpenCountrySelect] = useState(false);
  const [timer, setTimer] = useState(91); // 1:31 en secondes
  const [canResend, setCanResend] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Timer countdown
  useEffect(() => {
    if (step === "otp" && timer > 0) {
      const interval = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [step, timer]);

  // Auto-verify when all 6 digits are entered
  useEffect(() => {
    const fullOtp = otp.join("");
    if (fullOtp.length === 6) {
      handleVerifyOtp();
    }
  }, [otp]);

  const handleSendOtp = async () => {
    if (!phone || phone.length < 9) {
      toast.error("Veuillez entrer un numéro de téléphone valide");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('send-otp', {
        body: { 
          phoneNumber: phone,
          countryCode: countryCode 
        }
      });
      
      if (error) throw error;
      
      setStep("otp");
      setTimer(91);
      setCanResend(false);
      toast.success("Un code de vérification a été envoyé");
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de l'envoi du code");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!canResend) return;
    
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('send-otp', {
        body: { 
          phoneNumber: phone,
          countryCode: countryCode 
        }
      });
      
      if (error) throw error;
      
      setTimer(91);
      setCanResend(false);
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
      toast.success("Un nouveau code a été envoyé");
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de l'envoi du code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const fullOtp = otp.join("");
    if (fullOtp.length < 6) {
      toast.error("Veuillez entrer le code de vérification complet");
      return;
    }

    // Prevent multiple simultaneous verification attempts
    if (loading) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-otp', {
        body: { 
          phoneNumber: phone,
          countryCode: countryCode,
          code: fullOtp 
        }
      });
      
      if (error) {
        // Handle 404 errors (expired or already used OTP)
        if (error.message?.includes('404') || error.message?.includes('not found')) {
          toast.error("Code expiré ou déjà utilisé. Demandez un nouveau code.");
          setOtp(["", "", "", "", "", ""]);
          otpRefs.current[0]?.focus();
          setCanResend(true);
          return;
        }
        throw error;
      }
      
      if (!data.success) {
        toast.error(data.error || "Code invalide ou expiré");
        setOtp(["", "", "", "", "", ""]);
        otpRefs.current[0]?.focus();
        return;
      }

      // Sign in with the session
      const { error: signInError } = await supabase.auth.setSession({
        access_token: data.session.properties.access_token,
        refresh_token: data.session.properties.refresh_token,
      });

      if (signInError) throw signInError;

      toast.success("Connexion réussie");
      
      // Redirect based on hairdresser status
      if (data.hairdresser.status === "En attente") {
        navigate("/pwa/onboarding");
      } else {
        navigate("/pwa/dashboard");
      }
    } catch (error: any) {
      console.error('Verification error:', error);
      toast.error(error.message || "Code invalide");
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
              <Popover open={openCountrySelect} onOpenChange={setOpenCountrySelect}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openCountrySelect}
                    className="w-28 h-12 justify-between"
                  >
                    <span className="flex items-center gap-2">
                      {countryCodes.find((c) => c.code === countryCode)?.flag}
                      {countryCode}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-0">
                  <Command>
                    <CommandInput placeholder="Search country..." />
                    <CommandEmpty>No country found.</CommandEmpty>
                    <CommandGroup>
                      {countryCodes.map((country) => (
                        <CommandItem
                          key={country.code}
                          value={`${country.name} ${country.code.replace("+", "")}`}
                          onSelect={() => {
                            setCountryCode(country.code);
                            setOpenCountrySelect(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              countryCode === country.code ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="mr-2">{country.flag}</span>
                          {country.name} ({country.code})
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
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

            {/* OTP Input - 6 separate boxes */}
            <div className="flex justify-center gap-2 mb-4">
              {otp.map((digit, index) => (
                <Input
                  key={index}
                  ref={(el) => (otpRefs.current[index] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(index, e)}
                  className="w-14 h-16 text-center text-2xl font-semibold rounded-lg border-2 border-blue-500"
                />
              ))}
            </div>
            <p className="text-xs text-center text-gray-400 mb-8">
              {canResend ? (
                <button
                  onClick={handleResendOtp}
                  className="text-blue-500 underline"
                  disabled={loading}
                >
                  Send code again
                </button>
              ) : (
                <>Didn't receive code ? / Send again in {formatTimer(timer)}</>
              )}
            </p>

            <Button
              onClick={handleVerifyOtp}
              disabled={otp.join("").length < 6 || loading}
              className={`w-full h-12 rounded-full mb-8 ${
                otp.join("").length >= 6
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
