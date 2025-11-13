import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle } from "lucide-react";
import oomLogo from "@/assets/oom-logo.svg";

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
  const [step, setStep] = useState<"email" | "password" | "signup" | "not-found" | "set-password">("email");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Redirect if already authenticated OR check for invitation/recovery link
  useEffect(() => {
    const checkAuthStatus = async () => {
      // Check for auth token in URL hash (from email link)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const type = hashParams.get('type');
      const error = hashParams.get('error');
      const errorCode = hashParams.get('error_code');
      const accessToken = hashParams.get('access_token');

      // Also check URL search params for explicit flow marker from our invite email
      const searchParams = new URLSearchParams(window.location.search);
      const flow = searchParams.get('flow'); // 'invite' | 'recovery'
      
      // Handle expired or invalid links
      if (error === 'access_denied' && errorCode === 'otp_expired') {
        toast({
          title: "Lien expiré",
          description: "Le lien d'invitation a expiré. Veuillez contacter un administrateur pour obtenir un nouveau lien.",
          variant: "destructive",
        });
        // Clear the error from URL
        window.history.replaceState({}, '', '/auth');
        setStep('email');
        return;
      }
      
      // If there's an access token and type is invite/recovery/signup, show password form
      if (accessToken && (type === 'invite' || type === 'recovery' || type === 'signup')) {
        console.log('Invitation/recovery/signup link detected, showing password form');
        setStep('set-password');
        return;
      }

      // If we were redirected with a flow marker, force the password step
      if (flow === 'invite' || flow === 'recovery') {
        console.log('Flow marker detected in query params, showing password form');
        setStep('set-password');
        return;
      }

      // Otherwise check if already authenticated
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/", { replace: true });
      }
    };

    checkAuthStatus();
  }, [navigate, toast]);

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
        
        // Admin record exists, check if they have an account
        if (checkResult.hasAccount) {
          // User has already signed up, show password field for login
          setStep("password");
        } else {
          // Admin exists but hasn't signed up yet, show signup
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
        if ((error.message || "").includes("User already registered")) {
          toast({
            title: "Compte existant",
            description: "Un compte existe déjà. Veuillez vous connecter.",
          });
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
      const { error: signInError } = await supabase.auth.signInWithPassword({
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

      navigate("/");
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
        if (error.message.includes("Invalid login credentials")) {
          toast({
            title: "Erreur de connexion",
            description: "Email ou mot de passe incorrect",
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

      // Update admin status to "Actif" on first login
      if (data.user) {
        await supabase
          .from("admins")
          .update({ status: "Actif" })
          .eq("user_id", data.user.id);
      }

      toast({
        title: "Connexion réussie",
        description: "Bienvenue !",
      });
      navigate("/");
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
    } catch (error: any) {
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

  const handleSetPassword = async () => {
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
      // Update user password (works for both invite and recovery)
      const { data, error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        toast({
          title: "Erreur",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      // Update admin status to "Actif" after password is set
      if (data.user) {
        await supabase
          .from("admins")
          .update({ status: "Actif" })
          .eq("user_id", data.user.id);
      }

      toast({
        title: "Mot de passe défini",
        description: "Votre compte est maintenant actif. Connexion en cours...",
      });

      // User is automatically logged in after password update
      navigate("/");
    } finally {
      setIsLoading(false);
    }
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

        {step === "set-password" && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-center">Définissez votre mot de passe</h2>
              <p className="text-sm text-muted-foreground text-center">
                Choisissez un mot de passe sécurisé pour votre compte
              </p>
              <Input
                type="password"
                placeholder="Nouveau mot de passe (min. 6 caractères)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="w-full h-12 text-base mt-4"
                onKeyDown={(e) => e.key === "Enter" && handleSetPassword()}
                autoFocus
              />
            </div>

            <Button
              onClick={handleSetPassword}
              disabled={isLoading}
              className="w-full h-14 text-base font-medium rounded-xl bg-gray-400 hover:bg-black text-white transition-colors disabled:opacity-50"
            >
              {isLoading ? "Configuration..." : "Définir le mot de passe"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Auth;
