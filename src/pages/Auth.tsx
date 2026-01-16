import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle } from "lucide-react";
import oomLogo from "@/assets/oom-logo.svg";
import { getRoleRedirect } from "@/hooks/useRoleRedirect";

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

      if (admin && admin.status?.toLowerCase() !== "active" && admin.status !== "Actif") {
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <img src={oomLogo} alt="OOM Logo" className="h-24 w-auto" />
        </div>

        {/* Title */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold text-foreground">Connexion avec OOM</h1>
          <p className="text-muted-foreground">Entrez votre numéro de téléphone ou email</p>
        </div>

        {/* Tabs */}
        <div className="flex justify-center gap-8 border-b border-border">
          <button
            onClick={() => handleTabChange("phone")}
            className={`pb-3 text-sm font-medium transition-colors ${
              loginMethod === "phone"
                ? "text-foreground border-b-2 border-foreground"
                : "text-muted-foreground"
            }`}
            disabled={isLoading}
          >
            Numéro de téléphone
          </button>
          <button
            onClick={() => handleTabChange("email")}
            className={`pb-3 text-sm font-medium transition-colors ${
              loginMethod === "email"
                ? "text-foreground border-b-2 border-foreground"
                : "text-muted-foreground"
            }`}
            disabled={isLoading}
          >
            Email
          </button>
        </div>

        {/* Content based on step */}
        {step === "email" && (
          <div className="space-y-6">
            <Input
              type={loginMethod === "email" ? "email" : "tel"}
              placeholder={loginMethod === "email" ? "yourname@mail.com" : "+33 6 12 34 56 78"}
              value={emailOrPhone}
              onChange={(e) => setEmailOrPhone(e.target.value)}
              disabled={isLoading}
              className="w-full h-12 text-base"
              onKeyDown={(e) => e.key === "Enter" && handleNext()}
            />

            <Button
              onClick={handleNext}
              disabled={isLoading}
              className="w-full h-14 text-base font-medium rounded-xl bg-gray-400 hover:bg-black text-white transition-colors disabled:opacity-50"
            >
              {isLoading ? "Chargement..." : "Suivant"}
            </Button>
          </div>
        )}

        {step === "signup" && (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Créer un compte pour <span className="font-medium text-foreground">{emailOrPhone}</span>
              </p>
              <Input
                type="password"
                placeholder="Créer un mot de passe (min. 6 caractères)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="w-full h-12 text-base"
                onKeyDown={(e) => e.key === "Enter" && handleSignup()}
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleBack}
                disabled={isLoading}
                variant="outline"
                className="flex-1 h-14 text-base font-medium rounded-xl"
              >
                Retour
              </Button>
              <Button
                onClick={handleSignup}
                disabled={isLoading}
                className="flex-1 h-14 text-base font-medium rounded-xl bg-gray-400 hover:bg-black text-white transition-colors disabled:opacity-50"
              >
                {isLoading ? "Création..." : "Créer le compte"}
              </Button>
            </div>
          </div>
        )}

        {step === "password" && (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Connexion en tant que <span className="font-medium text-foreground">{emailOrPhone}</span>
              </p>
              <Input
                type="password"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="w-full h-12 text-base"
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleBack}
                disabled={isLoading}
                variant="outline"
                className="flex-1 h-14 text-base font-medium rounded-xl"
              >
                Retour
              </Button>
              <Button
                onClick={handleLogin}
                disabled={isLoading}
                className="flex-1 h-14 text-base font-medium rounded-xl bg-gray-400 hover:bg-black text-white transition-colors disabled:opacity-50"
              >
                {isLoading ? "Chargement..." : "Connexion"}
              </Button>
            </div>
          </div>
        )}

        {step === "not-found" && (
          <div className="space-y-6">
            <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
              <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="space-y-1 flex-1">
                <p className="text-sm font-medium text-foreground">
                  Accès non autorisé
                </p>
                <p className="text-sm text-muted-foreground">
                  Aucun compte trouvé avec {emailOrPhone}. Veuillez contacter un administrateur pour obtenir l'accès.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleBack}
                disabled={isLoading}
                variant="outline"
                className="flex-1 h-14 text-base font-medium rounded-xl"
              >
                Retour
              </Button>
              <Button
                onClick={handleContactAdmin}
                disabled={isLoading}
                className="flex-1 h-14 text-base font-medium rounded-xl bg-gray-400 hover:bg-black text-white transition-colors disabled:opacity-50"
              >
                {isLoading ? "Envoi..." : "Contacter l'admin"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Auth;
