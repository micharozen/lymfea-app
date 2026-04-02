import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Loader2 } from "lucide-react";
import { brand, brandLogos } from "@/config/brand";
import { getRoleRedirect } from "@/hooks/useRoleRedirect";
import { DevLoginPanel } from "@/components/DevLoginPanel";

const Auth = () => {
  const [loginMethod, setLoginMethod] = useState<"email" | "phone">("email");

  const handleTabChange = (value: string) => {
    setLoginMethod(value as "email" | "phone");
    // Reset form when changing tabs
    setStep("email");
    setEmailOrPhone("");
    setPassword("");
  };
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [foundEmail, setFoundEmail] = useState<string>("");
  const [step, setStep] = useState<"email" | "password" | "signup" | "not-found">("email");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Redirect if already authenticated OR redirect invitation links to /set-password
  useEffect(() => {
    const checkAuthStatus = async () => {
      // Check for auth token in URL hash (from email link)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const type = hashParams.get("type");
      const accessToken = hashParams.get("access_token");

      // Also check URL search params for explicit flow marker from our invite email
      const searchParams = new URLSearchParams(window.location.search);
      const flow = searchParams.get("flow"); // 'invite' | 'recovery'

      // If there's an access token and type is invite/recovery/signup, redirect to set-password
      if (accessToken && (type === "invite" || type === "recovery" || type === "signup")) {
        console.log("Invitation/recovery/signup link detected, redirecting to /set-password");
        navigate("/set-password" + window.location.hash + window.location.search, { replace: true });
        return;
      }

      // If we were redirected with a flow marker, redirect to set-password
      if (flow === "invite" || flow === "recovery") {
        console.log("Flow marker detected in query params, redirecting to /set-password");
        navigate("/set-password" + window.location.search, { replace: true });
        return;
      }

      // Otherwise check if already authenticated
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) return;

      // Role-based redirect.
      // If we cannot determine a role, we MUST allow the user to access /auth
      // (and reset the session to avoid getting stuck in a redirect loop).
      const { role, redirectPath } = await getRoleRedirect(session.user.id);

      if (!role) {
        console.warn("[Auth] Session without role detected. Signing out to allow login.");
        await supabase.auth.signOut();
        toast({
          title: "Session réinitialisée",
          description: "Veuillez vous reconnecter.",
        });
        return;
      }

      navigate(redirectPath, { replace: true });
    };

    checkAuthStatus();
  }, [navigate]);

  const handleNext = async () => {
    if (!emailOrPhone.trim()) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer votre email ou numéro de téléphone",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Use edge function to check if admin exists (bypasses RLS)
      const { data: checkResult, error: checkError } = await supabase.functions.invoke(
        "check-admin-exists",
        {
          body: { emailOrPhone: emailOrPhone },
        }
      );

      if (checkError) {
        console.error("Error checking admin:", checkError);
        toast({
          title: "Erreur",
          description: "Erreur lors de la vérification",
          variant: "destructive",
        });
        return;
      }

      if (checkResult.exists) {
        // Store the email for authentication (even if user entered phone)
        setFoundEmail(checkResult.email);
        
        // If user has auth account, go to login. Otherwise, go to signup.
        if (checkResult.hasAccount) {
          setStep("password");
        } else {
          setStep("signup");
        }
      } else {
        // User doesn't exist in admins table, show contact admin message
        setStep("not-found");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!password.trim() || password.length < 6) {
      toast({
        title: "Erreur",
        description: "Le mot de passe doit contenir au moins 6 caractères",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/`;
      // Use the found email for signup (even if user entered phone)
      const emailToUse = foundEmail || emailOrPhone;
      
      const { error } = await supabase.auth.signUp({
        email: emailToUse,
        password: password,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        if ((error.message || "").includes("User already registered") || error.message?.includes("already_exists")) {
          toast({
            title: "Compte existant",
            description: "Ce compte existe déjà. Redirection vers la connexion...",
          });
          // Clear password and switch to login
          setPassword("");
          setStep("password");
          return;
        }
        toast({
          title: "Erreur d'inscription",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Compte créé",
        description: "Bienvenue ! Connexion en cours...",
      });
      
      // After signup, sign in immediately
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password: password,
      });

      if (signInError) {
        toast({
          title: "Compte créé",
          description: "Veuillez vous connecter",
        });
        setStep("password");
        return;
      }

      // Ensure backend role mapping exists, then redirect using centralized logic
      if (signInData?.user) {
        await supabase.functions.invoke("ensure-user-role", {
          body: { userId: signInData.user.id, email: emailToUse },
        });

        const { redirectPath } = await getRoleRedirect(signInData.user.id);
        navigate(redirectPath, { replace: true });
      } else {
        navigate("/");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!password.trim()) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer votre mot de passe",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Use the found email for login (even if user entered phone)
      const emailToUse = foundEmail || emailOrPhone;
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password: password,
      });

      if (error) {
        // Check if user needs to sign up (account exists in admin/concierge table but no auth account)
        if (error.message.includes("Invalid login credentials")) {
          // Try to sign up the user instead - this handles the case where admin record exists
          // but the user hasn't created their auth account yet
          const { error: signupError } = await supabase.auth.signUp({
            email: emailToUse,
            password: password,
            options: {
              emailRedirectTo: `${window.location.origin}/`,
            },
          });

          if (!signupError) {
            // Sign up succeeded, now sign in
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
              email: emailToUse,
              password: password,
            });

            if (!signInError && signInData?.user) {
              toast({
                title: "Compte créé",
                description: "Bienvenue !",
              });
              
              // Ensure backend role mapping exists, then redirect
              await supabase.functions.invoke("ensure-user-role", {
                body: { userId: signInData.user.id, email: emailToUse },
              });

              const { redirectPath } = await getRoleRedirect(signInData.user.id);
              navigate(redirectPath, { replace: true });
              return;
            }
          }

          // If signup also failed, show generic error
          toast({
            title: "Erreur de connexion",
            description: "Identifiants incorrects",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Erreur",
            description: error.message,
            variant: "destructive",
          });
        }
        return;
      }

      // If this is an invited admin account (status != Actif), force password change first
      const { data: admin } = await supabase
        .from("admins")
        .select("status")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (admin && admin.status !== "Actif") {
        navigate("/update-password", { replace: true });
        return;
      }

      // Check if concierge needs to change password
      const { data: concierge } = await supabase
        .from("concierges")
        .select("must_change_password")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (concierge?.must_change_password) {
        navigate("/update-password", { replace: true });
        return;
      }

      toast({
        title: "Connexion réussie",
        description: "Bienvenue !",
      });
      
      // Ensure backend role mapping exists, then redirect using centralized logic
      await supabase.functions.invoke("ensure-user-role", {
        body: { userId: data.user.id, email: emailToUse },
      });

      const { redirectPath } = await getRoleRedirect(data.user.id);
      navigate(redirectPath, { replace: true });
    } finally {
      setIsLoading(false);
    }
  };

  const handleContactAdmin = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.functions.invoke("contact-admin", {
        body: { emailOrPhone },
      });

      if (error) throw error;

      toast({
        title: "Demande envoyée",
        description: "Un administrateur vous contactera bientôt",
      });
    } catch (error) {
      console.error("Error contacting admin:", error);
      toast({
        title: "Erreur",
        description: "Erreur lors de l'envoi de la demande",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setStep("email");
    setPassword("");
    setFoundEmail("");
  };


  return (
    <div className="min-h-screen flex">
      {/* Left Panel — Form */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-20 bg-white">
        <div className="w-full max-w-md mx-auto">
          {/* Logo */}
          <div className="mb-12">
            <img src={brandLogos.primary} alt={brand.name} className="h-10 w-auto" />
          </div>

          {/* Title */}
          <div className="mb-10">
            <h1 className="text-3xl font-kormelink text-gray-900 mb-2">Bienvenue</h1>
            <p className="text-gray-500 text-base">
              Connectez-vous pour accéder à votre espace
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-6 mb-8">
            <button
              onClick={() => handleTabChange("email")}
              className={`pb-2.5 text-sm font-medium tracking-wide uppercase transition-all ${
                loginMethod === "email"
                  ? "text-gray-900 border-b-2 border-gray-900"
                  : "text-gray-400 hover:text-gray-600"
              }`}
              disabled={isLoading}
            >
              Email
            </button>
            <button
              onClick={() => handleTabChange("phone")}
              className={`pb-2.5 text-sm font-medium tracking-wide uppercase transition-all ${
                loginMethod === "phone"
                  ? "text-gray-900 border-b-2 border-gray-900"
                  : "text-gray-400 hover:text-gray-600"
              }`}
              disabled={isLoading}
            >
              Telephone
            </button>
          </div>

          {/* Dev Quick Login - only renders in local dev */}
          <DevLoginPanel />

          {/* Content based on step */}
          {step === "email" && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {loginMethod === "email" ? "Adresse email" : "Numero de telephone"}
                </label>
                <Input
                  type={loginMethod === "email" ? "email" : "tel"}
                  placeholder={loginMethod === "email" ? "vous@exemple.com" : "+33 6 12 34 56 78"}
                  value={emailOrPhone}
                  onChange={(e) => setEmailOrPhone(e.target.value)}
                  disabled={isLoading}
                  className="w-full h-12 text-base bg-gray-50 border-gray-200 focus:border-gray-900 focus:ring-gray-900 rounded-lg"
                  onKeyDown={(e) => e.key === "Enter" && handleNext()}
                />
              </div>

              <Button
                onClick={handleNext}
                disabled={isLoading}
                className="w-full h-12 text-base font-medium rounded-lg bg-gray-900 hover:bg-black text-white transition-colors disabled:opacity-50"
              >
                {isLoading ? "Chargement..." : "Continuer"}
                {isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              </Button>
            </div>
          )}

          {step === "signup" && (
            <div className="space-y-5">
              <div>
                <p className="text-sm text-gray-500 mb-4">
                  Creer un compte pour <span className="font-medium text-gray-900">{emailOrPhone}</span>
                </p>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Mot de passe
                </label>
                <Input
                  type="password"
                  placeholder="Min. 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="w-full h-12 text-base bg-gray-50 border-gray-200 focus:border-gray-900 focus:ring-gray-900 rounded-lg"
                  onKeyDown={(e) => e.key === "Enter" && handleSignup()}
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleBack}
                  disabled={isLoading}
                  variant="outline"
                  className="flex-1 h-12 text-base font-medium rounded-lg border-gray-300 hover:bg-gray-50"
                >
                  Retour
                </Button>
                <Button
                  onClick={handleSignup}
                  disabled={isLoading}
                  className="flex-1 h-12 text-base font-medium rounded-lg bg-gray-900 hover:bg-black text-white transition-colors disabled:opacity-50"
                >
                  {isLoading ? "Creation..." : "Creer le compte"}
                  {isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                </Button>
              </div>
            </div>
          )}

          {step === "password" && (
            <div className="space-y-5">
              <div>
                <p className="text-sm text-gray-500 mb-4">
                  Connexion en tant que <span className="font-medium text-gray-900">{emailOrPhone}</span>
                </p>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Mot de passe
                </label>
                <Input
                  type="password"
                  placeholder="Votre mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="w-full h-12 text-base bg-gray-50 border-gray-200 focus:border-gray-900 focus:ring-gray-900 rounded-lg"
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  autoFocus
                />
                <Link
                  to="/forgot-password"
                  className="inline-block mt-2 text-sm text-gray-400 hover:text-gray-900 transition-colors"
                >
                  Mot de passe oublie ?
                </Link>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleBack}
                  disabled={isLoading}
                  variant="outline"
                  className="flex-1 h-12 text-base font-medium rounded-lg border-gray-300 hover:bg-gray-50"
                >
                  Retour
                </Button>
                <Button
                  onClick={handleLogin}
                  disabled={isLoading}
                  className="flex-1 h-12 text-base font-medium rounded-lg bg-gray-900 hover:bg-black text-white transition-colors disabled:opacity-50"
                >
                  {isLoading ? "Connexion..." : "Se connecter"}
                  {isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                </Button>
              </div>
            </div>
          )}

          {step === "not-found" && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-lg">
                <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div className="space-y-1 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    Acces non autorise
                  </p>
                  <p className="text-sm text-gray-500">
                    Aucun compte trouve avec {emailOrPhone}. Contactez un administrateur.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleBack}
                  disabled={isLoading}
                  variant="outline"
                  className="flex-1 h-12 text-base font-medium rounded-lg border-gray-300 hover:bg-gray-50"
                >
                  Retour
                </Button>
                <Button
                  onClick={handleContactAdmin}
                  disabled={isLoading}
                  className="flex-1 h-12 text-base font-medium rounded-lg bg-gray-900 hover:bg-black text-white transition-colors disabled:opacity-50"
                >
                  {isLoading ? "Envoi..." : "Contacter l'admin"}
                </Button>
              </div>
            </div>
          )}

          {/* Footer */}
          <p className="mt-12 text-xs text-gray-400 text-center">
            &copy; {new Date().getFullYear()} Lymfea SAS. Tous droits reserves.
          </p>
        </div>
      </div>

      {/* Right Panel — Decorative */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden">
        {/* Warm gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber-400 via-orange-500 to-orange-600" />

        {/* Decorative wave layers */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 800 1000"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M0,300 C150,250 350,400 500,350 C650,300 750,200 800,250 L800,1000 L0,1000 Z"
            fill="rgba(255,255,255,0.08)"
          />
          <path
            d="M0,500 C200,450 300,550 500,500 C700,450 750,400 800,450 L800,1000 L0,1000 Z"
            fill="rgba(255,255,255,0.06)"
          />
          <path
            d="M0,700 C100,680 300,750 500,700 C700,650 780,680 800,700 L800,1000 L0,1000 Z"
            fill="rgba(255,255,255,0.04)"
          />
        </svg>

        {/* Decorative circles */}
        <div className="absolute top-20 right-20 w-64 h-64 rounded-full bg-white/10 blur-sm" />
        <div className="absolute bottom-32 left-16 w-40 h-40 rounded-full bg-white/5" />

        {/* Brand content */}
        <div className="relative z-10 flex flex-col justify-center items-start px-16 py-20">
          <img
            src={brandLogos.monogramWhite}
            alt=""
            className="w-16 h-16 mb-8 opacity-80"
          />
          <h2 className="text-white text-4xl font-kormelink leading-tight mb-4 max-w-sm">
            L'excellence du bien-etre, simplifiee
          </h2>
          <p className="text-white/70 text-lg max-w-sm leading-relaxed">
            Gerez vos reservations, vos equipes et votre activite en toute serenite.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
