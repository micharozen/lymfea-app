import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, Check, ChevronsUpDown, AlertCircle } from "lucide-react";
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
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

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
  const { t } = useTranslation('pwa');
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [countryCode, setCountryCode] = useState("+33");
  const [openCountrySelect, setOpenCountrySelect] = useState(false);
  const [timer, setTimer] = useState(91);
  const [canResend, setCanResend] = useState(false);
  const [isCodeExpired, setIsCodeExpired] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id)
          .eq('role', 'hairdresser')
          .maybeSingle();

        if (roles) {
          // User is a hairdresser - redirect to PWA
          const { data: hairdresser } = await supabase
            .from('hairdressers')
            .select('status')
            .eq('user_id', session.user.id)
            .single();

          if (hairdresser) {
            if (hairdresser.status === "pending") {
              navigate("/pwa/onboarding", { replace: true });
            } else {
              navigate("/pwa/dashboard", { replace: true });
            }
          }
        }
      }
    };

    checkSession();
  }, [navigate]);

  useEffect(() => {
    if (step === "otp" && timer > 0) {
      const interval = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            setIsCodeExpired(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [step, timer]);

  useEffect(() => {
    const fullOtp = otp.join("");
    if (fullOtp.length === 6) {
      handleVerifyOtp();
    }
  }, [otp]);

  const handleSendOtp = async () => {
    if (!phone || phone.length < 9) {
      toast.error(t('common:errors.invalidPhone'));
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-otp', {
        body: { 
          phoneNumber: phone,
          countryCode: countryCode 
        }
      });
      
      if (error) {
        console.log('Full error object:', JSON.stringify(error, null, 2));
        const errorMessage = (error as any)?.context?.body?.error || error.message || t('common:errors.generic');
        
        if (errorMessage.includes('non trouvé') || errorMessage.includes('not found')) {
          toast.error("Ce numéro n'est pas associé à un compte coiffeur. Contactez booking@oomworld.com pour être ajouté.", {
            duration: 8000,
          });
        } else {
          toast.error(errorMessage);
        }
        return;
      }
      
      setStep("otp");
      setTimer(91);
      setCanResend(false);
      setIsCodeExpired(false);
      toast.success(t('common:toasts.success'));
    } catch (error: any) {
      console.error('Send OTP error:', error);
      const errorMsg = error?.context?.body?.error || error.message || t('common:errors.generic');
      
      if (errorMsg.includes('non trouvé') || errorMsg.includes('not found')) {
        toast.error("Ce numéro n'est pas associé à un compte coiffeur. Contactez booking@oomworld.com pour être ajouté.", {
          duration: 8000,
        });
      } else {
        toast.error(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!canResend) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-otp', {
        body: { 
          phoneNumber: phone,
          countryCode: countryCode 
        }
      });
      
      if (error) {
        const errorMessage = (error as any)?.context?.body?.error || error.message || t('common:errors.generic');
        
        if (errorMessage.includes('non trouvé') || errorMessage.includes('not found')) {
          toast.error("Ce numéro n'est pas associé à un compte coiffeur. Contactez booking@oomworld.com pour être ajouté.", {
            duration: 8000,
          });
        } else {
          toast.error(errorMessage);
        }
        return;
      }
      
      setTimer(91);
      setCanResend(false);
      setIsCodeExpired(false);
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
      toast.success(t('common:toasts.success'));
    } catch (error: any) {
      console.error('Resend OTP error:', error);
      const errorMsg = error?.context?.body?.error || error.message || t('common:errors.generic');
      
      if (errorMsg.includes('non trouvé') || errorMsg.includes('not found')) {
        toast.error("Ce numéro n'est pas associé à un compte coiffeur. Contactez booking@oomworld.com pour être ajouté.", {
          duration: 8000,
        });
      } else {
        toast.error(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const fullOtp = otp.join("");
    if (fullOtp.length < 6) {
      toast.error(t('common:errors.required'));
      return;
    }

    if (loading) return;

    setLoading(true);
    
    // Force sign out any existing session before setting new one
    await supabase.auth.signOut();
    try {
      const { data, error } = await supabase.functions.invoke('verify-otp', {
        body: { 
          phoneNumber: phone,
          countryCode: countryCode,
          code: fullOtp 
        }
      });
      
      if (error) {
        console.error('OTP verification error:', error);
        
        if (error.message?.includes('404') || error.message?.includes('not found')) {
          setIsCodeExpired(true);
          toast.error(t('login.expired'), {
            description: t('login.resend'),
            duration: 5000
          });
          setOtp(["", "", "", "", "", ""]);
          otpRefs.current[0]?.focus();
          setCanResend(true);
          setTimer(0);
          return;
        }
        
        toast.error(t('common:errors.generic'), {
          duration: 4000
        });
        setOtp(["", "", "", "", "", ""]);
        otpRefs.current[0]?.focus();
        return;
      }
      
      if (!data.success) {
        toast.error(t('common:errors.generic'), {
          description: data.error,
          duration: 4000
        });
        setOtp(["", "", "", "", "", ""]);
        otpRefs.current[0]?.focus();
        return;
      }

      const { error: signInError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      if (signInError) {
        console.error('Session error:', signInError);
        throw signInError;
      }

      const { data: { session: savedSession } } = await supabase.auth.getSession();
      console.log('✅ Session saved:', !!savedSession);

      toast.success(t('common:toasts.success'));
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (data.hairdresser.status === "pending") {
        navigate("/pwa/onboarding", { replace: true });
      } else {
        navigate("/pwa/dashboard", { replace: true });
      }
    } catch (error: any) {
      console.error('Verification error:', error);
      toast.error(t('common:errors.generic'), {
        duration: 4000
      });
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

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
      <div className="p-4 flex justify-between items-center">
        <button onClick={() => step === "otp" ? setStep("phone") : navigate("/pwa/welcome")}>
          <ArrowLeft className="h-6 w-6" />
        </button>
        <LanguageSwitcher variant="minimal" />
      </div>

      <div className="flex-1 flex flex-col px-6 pt-8">
        {step === "phone" ? (
          <>
            <h1 className="text-2xl font-semibold mb-2">{t('login.title')}</h1>
            <p className="text-sm text-gray-500 mb-8">{t('login.subtitle')}</p>

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
              {t('login.continue')}
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold mb-2">{t('login.enterCode')}</h1>
            <p className="text-sm text-gray-500 mb-8">{t('login.codeSent')} ***{phone.slice(-4)}</p>

            <div className="flex justify-center gap-1.5 sm:gap-2 mb-4 px-2">
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
                  disabled={isCodeExpired}
                  className={cn(
                    "w-12 sm:w-14 h-14 sm:h-16 text-center text-xl sm:text-2xl font-semibold rounded-lg border-2 transition-all flex-shrink-0",
                    isCodeExpired 
                      ? "border-orange-300 bg-orange-50 text-gray-400 cursor-not-allowed"
                      : "border-blue-500 bg-white"
                  )}
                />
              ))}
            </div>
            
            {isCodeExpired && (
              <div className="mb-4 p-4 bg-orange-50 border-2 border-orange-400 rounded-xl flex items-start gap-3 animate-in fade-in duration-300">
                <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-orange-900 mb-1">
                    ⏰ {t('login.expired')}
                  </p>
                  <p className="text-xs text-orange-700">
                    {t('login.resend')}
                  </p>
                </div>
              </div>
            )}
            
            <p className="text-xs text-center text-gray-400 mb-8">
              {canResend ? (
                <button
                  onClick={handleResendOtp}
                  className="text-blue-500 underline"
                  disabled={loading}
                >
                  {t('login.resend')}
                </button>
              ) : (
                <>{t('login.codeExpiredIn')} {formatTimer(timer)}</>
              )}
            </p>

            <Button
              onClick={handleVerifyOtp}
              disabled={otp.join("").length < 6 || loading || isCodeExpired}
              className={cn(
                "w-full h-12 rounded-full mb-8",
                otp.join("").length >= 6 && !isCodeExpired
                  ? "bg-black text-white hover:bg-black/90"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              )}
            >
              {isCodeExpired ? t('login.expired') : t('login.verify')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default PwaLogin;
