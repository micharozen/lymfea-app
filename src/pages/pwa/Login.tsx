import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Check, ChevronsUpDown, AlertCircle, Loader2, Eye, EyeOff } from "lucide-react";
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
import { brand } from "@/config/brand";
import { logger } from "@/lib/logger";
import { EdgeFunctionError, invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { isTherapistPending } from "@/hooks/useRoleRedirect";

type OtpErrorBody = {
  reason?: string;
  error?: string;
  retryAfterSeconds?: number;
};

const asOtpErrorBody = (error: Error | null): OtpErrorBody | undefined => {
  if (error instanceof EdgeFunctionError && error.body && typeof error.body === "object") {
    return error.body as OtpErrorBody;
  }
  return undefined;
};

const countryCodes = [
  { code: "+33", name: "France", flag: "🇫🇷" },
  { code: "+971", name: "United Arab Emirates", flag: "🇦🇪" },
  { code: "+1", name: "United States", flag: "🇺🇸" },
  { code: "+44", name: "United Kingdom", flag: "🇬🇧" },
  { code: "+34", name: "Spain", flag: "🇪🇸" },
  { code: "+39", name: "Italy", flag: "🇮🇹" },
  { code: "+49", name: "Germany", flag: "🇩🇪" },
];

type AuthMode = "password" | "otp-phone" | "otp-code" | "forgot";

// supabase.functions.invoke returns FunctionsHttpError where `.context` is the
// raw Response. Its body is a ReadableStream, so we must clone+parse it to get
// the actual server payload — otherwise we only see the generic
// "Edge Function returned a non-2xx status code" message.
async function extractEdgeError(error: unknown): Promise<{
  status?: number;
  body?: Record<string, unknown> | { raw: string } | undefined;
  serverMessage?: string;
}> {
  const ctx = (error as { context?: Response | undefined })?.context;
  let status: number | undefined;
  let body: Record<string, unknown> | { raw: string } | undefined;

  if (ctx && typeof ctx.clone === "function") {
    status = ctx.status;
    try {
      body = (await ctx.clone().json()) as Record<string, unknown>;
    } catch {
      try {
        body = { raw: await ctx.clone().text() };
      } catch {
        // ignore
      }
    }
  }

  const serverMessage =
    (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
      ? (body as { error: string }).error
      : undefined) ??
    (body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string"
      ? (body as { message: string }).message
      : undefined) ??
    (body && "raw" in (body as { raw?: string }) ? (body as { raw?: string }).raw : undefined) ??
    (error instanceof Error ? error.message : undefined);

  return { status, body, serverMessage };
}

const PwaLogin = () => {
  const navigate = useNavigate();
  const { t } = useTranslation("pwa");

  const [authMode, setAuthMode] = useState<AuthMode>("password");

  // Password auth state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // OTP auth state
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [countryCode, setCountryCode] = useState("+33");
  const [openCountrySelect, setOpenCountrySelect] = useState(false);
  const [timer, setTimer] = useState(91);
  const [canResend, setCanResend] = useState(false);
  const [isCodeExpired, setIsCodeExpired] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Forgot password state
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);

  const [loading, setLoading] = useState(false);

  // If a session already exists for a therapist, skip straight to dashboard or onboarding.
  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .eq("role", "therapist")
          .maybeSingle();

        if (roles) {
          const { data: therapist } = await supabase
            .from("therapists")
            .select("status, password_set")
            .eq("user_id", session.user.id)
            .maybeSingle();

          if (therapist) {
            if (isTherapistPending(therapist)) {
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

  // OTP resend timer
  useEffect(() => {
    if (authMode === "otp-code" && timer > 0) {
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
  }, [authMode, timer]);

  // Auto-submit OTP when 6 digits entered
  useEffect(() => {
    const fullOtp = otp.join("");
    if (fullOtp.length === 6) {
      handleVerifyOtp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  // ---- Post-login routing ----
  const routeAfterLogin = async (userId: string) => {
    const { data: therapist } = await supabase
      .from("therapists")
      .select("status, password_set")
      .eq("user_id", userId)
      .maybeSingle();

    if (therapist && isTherapistPending(therapist)) {
      navigate("/pwa/onboarding", { replace: true });
    } else {
      navigate("/pwa/dashboard", { replace: true });
    }
  };

  // ---- PASSWORD LOGIN ----
  const handlePasswordLogin = async () => {
    if (!email || !password) {
      toast.error(t("login.password.fillAllFields"));
      return;
    }

    setLoading(true);
    try {
      // Make sure no stale session is kept before signing in.
      await supabase.auth.signOut();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        console.error("Password sign-in error:", error);
        if (error.message?.toLowerCase().includes("invalid")) {
          toast.error(t("login.password.wrongCredentials"));
        } else {
          toast.error(error.message || t("login.password.error"));
        }
        return;
      }

      if (!data.user) {
        toast.error(t("login.password.error"));
        return;
      }

      // Confirm the user is actually a therapist — PWA is reserved for therapists.
      const { data: role } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .eq("role", "therapist")
        .maybeSingle();

      if (!role) {
        await supabase.auth.signOut();
        toast.error(t("login.password.notATherapist"));
        return;
      }

      toast.success(t("common:toasts.success"));
      await routeAfterLogin(data.user.id);
    } catch (error: any) {
      console.error("Password sign-in exception:", error);
      toast.error(t("common:errors.generic"));
    } finally {
      setLoading(false);
    }
  };

  // ---- FORGOT PASSWORD ----
  const handleSendResetEmail = async () => {
    if (!resetEmail) {
      toast.error(t("login.reset.emailRequired"));
      return;
    }

    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/pwa/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim().toLowerCase(), {
        redirectTo,
      });

      if (error) {
        console.error("Password reset error:", error);
        toast.error(error.message || t("common:errors.generic"));
        return;
      }

      setResetSent(true);
      toast.success(t("login.reset.sent"));
    } catch (error: any) {
      console.error("Password reset exception:", error);
      toast.error(t("common:errors.generic"));
    } finally {
      setLoading(false);
    }
  };

  // ---- OTP SEND ----
  const handleSendOtp = async () => {
    if (!phone || phone.length < 9) {
      toast.error(t("common:errors.invalidPhone"));
      return;
    }

    const phoneTail = phone.slice(-4);
    setLoading(true);
    try {
      const { data, error } = await invokeEdgeFunction<
        { phoneNumber: string; countryCode: string },
        { success?: boolean; reason?: string; error?: string }
      >("send-otp", {
        body: { phoneNumber: phone, countryCode },
        skipAuth: true,
        logContext: { flow: "pwa-otp-send", phoneTail, countryCode },
      });

      if (error) {
        const edge = error instanceof EdgeFunctionError ? error : null;
        const status = edge?.status;
        const body = asOtpErrorBody(error);
        const reason = body?.reason;
        const serverMessage = body?.error ?? error.message;

        logger.error("pwa.otp.send_failed", error, {
          status,
          reason,
          serverMessage,
          requestId: edge?.requestId,
          phoneTail,
          countryCode,
        });

        if (reason === "THERAPIST_NOT_FOUND") {
          toast.error(
            `Ce numéro n'est pas associé à un compte thérapeute. Contactez ${brand.legal.bookingEmail} pour être ajouté.`,
            { duration: 8000 },
          );
        } else if (status === 401 || status === 403) {
          toast.error(
            "Session expirée ou application obsolète. Fermez complètement l'app et rouvrez-la, ou réinstallez la PWA.",
            { duration: 10000 },
          );
        } else if (reason === "RATE_LIMITED" || status === 429) {
          const retryAfter = body?.retryAfterSeconds;
          const minutes = retryAfter ? Math.ceil(retryAfter / 60) : 30;
          toast.error(
            `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.`,
            { duration: 10000 },
          );
        } else if (status && status >= 500) {
          toast.error("Serveur indisponible. Réessayez dans quelques instants.", {
            duration: 8000,
          });
        } else if (!navigator.onLine) {
          toast.error("Pas de connexion internet. Vérifiez votre réseau.", { duration: 8000 });
        } else {
          toast.error(
            `${serverMessage || t("common:errors.generic")} (code ${status ?? "?"})`,
            { duration: 8000 },
          );
        }
        return;
      }

      if (data && data.success === false) {
        toast.error(
          `Ce numéro n'est pas associé à un compte thérapeute. Contactez ${brand.legal.bookingEmail} pour être ajouté.`,
          { duration: 8000 },
        );
        return;
      }

      setAuthMode("otp-code");
      setTimer(91);
      setCanResend(false);
      setIsCodeExpired(false);
      toast.success(t("common:toasts.success"));
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!canResend) return;

    const phoneTail = phone.slice(-4);
    setLoading(true);
    try {
      const { data, error } = await invokeEdgeFunction<
        { phoneNumber: string; countryCode: string },
        { success?: boolean; reason?: string; error?: string }
      >("send-otp", {
        body: { phoneNumber: phone, countryCode },
        skipAuth: true,
        logContext: { flow: "pwa-otp-resend", phoneTail, countryCode },
      });

      if (error) {
        const edge = error instanceof EdgeFunctionError ? error : null;
        const status = edge?.status;
        const body = asOtpErrorBody(error);
        const reason = body?.reason;
        const serverMessage = body?.error ?? error.message;

        logger.error("pwa.otp.resend_failed", error, {
          status,
          reason,
          serverMessage,
          requestId: edge?.requestId,
          phoneTail,
          countryCode,
        });

        if (status === 401 || status === 403) {
          toast.error(
            "Session expirée ou application obsolète. Fermez complètement l'app et rouvrez-la, ou réinstallez la PWA.",
            { duration: 10000 },
          );
        } else if (reason === "RATE_LIMITED" || status === 429) {
          const retryAfter = body?.retryAfterSeconds;
          const minutes = retryAfter ? Math.ceil(retryAfter / 60) : 30;
          toast.error(
            `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.`,
            { duration: 10000 },
          );
        } else if (status && status >= 500) {
          toast.error("Serveur indisponible. Réessayez dans quelques instants.", {
            duration: 8000,
          });
        } else if (!navigator.onLine) {
          toast.error("Pas de connexion internet. Vérifiez votre réseau.", { duration: 8000 });
        } else {
          toast.error(
            `${serverMessage || t("common:errors.generic")} (code ${status ?? "?"})`,
            { duration: 8000 },
          );
        }
        return;
      }

      if (data && data.success === false) {
        toast.error(t("common:errors.generic"));
        return;
      }

      setTimer(91);
      setCanResend(false);
      setIsCodeExpired(false);
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
      toast.success(t("common:toasts.success"));
    } finally {
      setLoading(false);
    }
  };

  // ---- OTP VERIFY ----
  const handleVerifyOtp = async () => {
    const fullOtp = otp.join("");
    if (fullOtp.length < 6) {
      toast.error(t("common:errors.required"));
      return;
    }

    if (loading) return;

    const phoneTail = phone.slice(-4);
    setLoading(true);
    await supabase.auth.signOut();

    try {
      const { data, error } = await invokeEdgeFunction<
        { phoneNumber: string; countryCode: string; code: string },
        {
          success: boolean;
          reason?: string;
          error?: string;
          user?: { id: string };
          session?: { access_token: string; refresh_token: string };
        }
      >("verify-otp", {
        body: { phoneNumber: phone, countryCode, code: fullOtp },
        skipAuth: true,
        logContext: { flow: "pwa-otp-verify", phoneTail, countryCode },
      });

      if (error) {
        const edge = error instanceof EdgeFunctionError ? error : null;
        const status = edge?.status;
        const body = asOtpErrorBody(error);
        const reason = body?.reason;
        const serverMessage = body?.error ?? error.message;

        logger.error("pwa.otp.verify_failed", error, {
          status,
          reason,
          serverMessage,
          requestId: edge?.requestId,
          phoneTail,
          countryCode,
        });

        if (reason === "OTP_EXPIRED") {
          setIsCodeExpired(true);
          toast.error(t("login.expired"), {
            description: t("login.resend"),
            duration: 5000,
          });
          setOtp(["", "", "", "", "", ""]);
          otpRefs.current[0]?.focus();
          setCanResend(true);
          setTimer(0);
          return;
        }

        if (status === 401 || status === 403) {
          toast.error(
            "Session expirée ou application obsolète. Fermez complètement l'app et rouvrez-la, ou réinstallez la PWA.",
            { duration: 10000 },
          );
        } else if (reason === "RATE_LIMITED" || status === 429) {
          const retryAfter = body?.retryAfterSeconds;
          const minutes = retryAfter ? Math.ceil(retryAfter / 60) : 30;
          toast.error(
            `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.`,
            { duration: 10000 },
          );
        } else if (reason === "OTP_INVALID" || status === 400) {
          toast.error("Code incorrect. Vérifiez les chiffres et réessayez.", { duration: 5000 });
        } else if (status && status >= 500) {
          toast.error("Serveur indisponible. Réessayez dans quelques instants.", {
            duration: 8000,
          });
        } else if (!navigator.onLine) {
          toast.error("Pas de connexion internet. Vérifiez votre réseau.", { duration: 8000 });
        } else {
          toast.error(
            `${serverMessage || t("common:errors.generic")} (code ${status ?? "?"})`,
            { duration: 8000 },
          );
        }
        setOtp(["", "", "", "", "", ""]);
        otpRefs.current[0]?.focus();
        return;
      }

      if (!data || !data.success || !data.session) {
        logger.warn("pwa.otp.verify_unsuccessful", {
          reason: data?.reason,
          serverError: data?.error,
          phoneTail,
        });
        toast.error(t("common:errors.generic"), {
          description: data?.error,
          duration: 4000,
        });
        setOtp(["", "", "", "", "", ""]);
        otpRefs.current[0]?.focus();
        return;
      }

      const { error: signInError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      if (signInError) throw signInError;

      toast.success(t("common:toasts.success"));
      await new Promise((resolve) => setTimeout(resolve, 100));

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await routeAfterLogin(user.id);
      }
    } catch (error: any) {
      const edge = error instanceof EdgeFunctionError ? error : null;
      logger.error("pwa.otp.verify_exception", error, {
        status: edge?.status,
        requestId: edge?.requestId,
        phoneTail: phone.slice(-4),
        countryCode,
      });
      toast.error(
        `${error?.message || t("common:errors.generic")}${edge?.status ? ` (code ${edge.status})` : ""}`,
        { duration: 6000 },
      );
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
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleBack = () => {
    if (authMode === "otp-code") {
      setAuthMode("otp-phone");
      setOtp(["", "", "", "", "", ""]);
      return;
    }
    if (authMode === "otp-phone") {
      setAuthMode("password");
      return;
    }
    if (authMode === "forgot") {
      setAuthMode("password");
      setResetSent(false);
      return;
    }
    navigate("/pwa/welcome");
  };

  return (
    <div className="flex flex-1 flex-col bg-background min-h-screen">
      <div className="p-4 flex justify-between items-center">
        <button
          onClick={handleBack}
          className="flex items-center justify-center h-10 w-10"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <LanguageSwitcher variant="minimal" />
      </div>

      <div className="flex-1 flex flex-col px-6 pt-8">
        {authMode === "password" && (
          <>
            <h1 className="text-2xl font-semibold mb-2">{t("login.password.title")}</h1>
            <p className="text-sm text-muted-foreground mb-8">{t("login.password.subtitle")}</p>

            <div className="space-y-4 mb-6">
              <div className="space-y-2">
                <Label htmlFor="email">{t("login.password.emailLabel")}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="therapist@example.com"
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t("login.password.passwordLabel")}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-12 pr-10"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handlePasswordLogin();
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end mb-6">
              <button
                type="button"
                onClick={() => {
                  setResetEmail(email);
                  setAuthMode("forgot");
                }}
                className="text-sm text-primary underline"
              >
                {t("login.password.forgot")}
              </button>
            </div>

            <Button
              onClick={handlePasswordLogin}
              disabled={!email || !password || loading}
              className={cn(
                "w-full h-12 rounded-full mb-4",
                email && password
                  ? "bg-black text-white hover:bg-black/90"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {loading ? t("login.password.signingIn") : t("login.password.submit")}
              {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            </Button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  {t("login.divider")}
                </span>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => setAuthMode("otp-phone")}
              className="w-full h-12 rounded-full"
            >
              {t("login.password.useSms")}
            </Button>
          </>
        )}

        {authMode === "otp-phone" && (
          <>
            <h1 className="text-2xl font-semibold mb-2">{t("login.title")}</h1>
            <p className="text-sm text-muted-foreground mb-8">{t("login.subtitle")}</p>

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
                              countryCode === country.code ? "opacity-100" : "opacity-0",
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
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="6 40 50 18 49"
                className="flex-1 h-12 rounded-lg border border-border text-lg"
              />
            </div>

            <Button
              onClick={handleSendOtp}
              disabled={phone.length < 9 || loading}
              className={cn(
                "w-full h-12 rounded-full mb-8",
                phone.length >= 9
                  ? "bg-black text-white hover:bg-black/90"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {loading ? "Envoi..." : t("login.continue")}
              {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            </Button>

            <Button
              variant="ghost"
              onClick={() => setAuthMode("password")}
              className="w-full h-12 text-muted-foreground"
            >
              {t("login.password.usePassword")}
            </Button>
          </>
        )}

        {authMode === "otp-code" && (
          <>
            <h1 className="text-2xl font-semibold mb-2">{t("login.enterCode")}</h1>
            <p className="text-sm text-muted-foreground mb-8">
              {t("login.codeSent")} ***{phone.slice(-4)}
            </p>

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
                      ? "border-orange-300 bg-orange-50 text-muted-foreground cursor-not-allowed"
                      : "border-primary bg-background",
                  )}
                />
              ))}
            </div>

            {isCodeExpired && (
              <div className="mb-4 p-4 bg-orange-50 border-2 border-orange-400 rounded-xl flex items-start gap-3 animate-in fade-in duration-300">
                <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-orange-900 mb-1">
                    ⏰ {t("login.expired")}
                  </p>
                  <p className="text-xs text-orange-700">{t("login.resend")}</p>
                </div>
              </div>
            )}

            <p className="text-xs text-center text-muted-foreground mb-8">
              {canResend ? (
                <button
                  onClick={handleResendOtp}
                  className="text-primary underline"
                  disabled={loading}
                >
                  {t("login.resend")}
                </button>
              ) : (
                <>
                  {t("login.codeExpiredIn")} {formatTimer(timer)}
                </>
              )}
            </p>

            <Button
              onClick={handleVerifyOtp}
              disabled={otp.join("").length < 6 || loading || isCodeExpired}
              className={cn(
                "w-full h-12 rounded-full mb-8",
                otp.join("").length >= 6 && !isCodeExpired
                  ? "bg-black text-white hover:bg-black/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              {loading
                ? "Vérification..."
                : isCodeExpired
                  ? t("login.expired")
                  : t("login.verify")}
              {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            </Button>
          </>
        )}

        {authMode === "forgot" && (
          <>
            <h1 className="text-2xl font-semibold mb-2">{t("login.reset.title")}</h1>
            <p className="text-sm text-muted-foreground mb-8">{t("login.reset.subtitle")}</p>

            {resetSent ? (
              <div className="p-4 bg-green-50 border-2 border-green-300 rounded-xl flex items-start gap-3">
                <Check className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-green-900 mb-1">
                    {t("login.reset.sent")}
                  </p>
                  <p className="text-xs text-green-700">{t("login.reset.checkInbox")}</p>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2 mb-6">
                  <Label htmlFor="reset-email">{t("login.password.emailLabel")}</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="therapist@example.com"
                    className="h-12"
                  />
                </div>

                <Button
                  onClick={handleSendResetEmail}
                  disabled={!resetEmail || loading}
                  className={cn(
                    "w-full h-12 rounded-full",
                    resetEmail
                      ? "bg-black text-white hover:bg-black/90"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {loading ? t("login.reset.sending") : t("login.reset.submit")}
                  {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PwaLogin;
