import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Check, X } from "lucide-react";
import oomLogo from "@/assets/oom-logo.svg";
import { z } from "zod";
import { getRoleRedirect } from "@/hooks/useRoleRedirect";

const passwordSchema = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères")
  .regex(/[A-Z]/, "Le mot de passe doit contenir au moins une majuscule")
  .regex(/[a-z]/, "Le mot de passe doit contenir au moins une minuscule")
  .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre")
  .regex(/[^A-Za-z0-9]/, "Le mot de passe doit contenir au moins un caractère spécial");

interface PasswordRequirement {
  label: string;
  test: (password: string) => boolean;
}

const passwordRequirements: PasswordRequirement[] = [
  { label: "Au moins 8 caractères", test: (p) => p.length >= 8 },
  { label: "Une majuscule (A-Z)", test: (p) => /[A-Z]/.test(p) },
  { label: "Une minuscule (a-z)", test: (p) => /[a-z]/.test(p) },
  { label: "Un chiffre (0-9)", test: (p) => /[0-9]/.test(p) },
  { label: "Un caractère spécial (!@#$...)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

const SetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidLink, setIsValidLink] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const checkAuthLink = async () => {
      // Check for auth token in URL hash (from email link)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const type = hashParams.get('type');
      const error = hashParams.get('error');
      const errorCode = hashParams.get('error_code');
      const accessToken = hashParams.get('access_token');

      // Also check URL search params for explicit flow marker
      const searchParams = new URLSearchParams(window.location.search);
      const flow = searchParams.get('flow');
      
      // Handle expired or invalid links
      if (error === 'access_denied' && errorCode === 'otp_expired') {
        toast({
          title: "Lien expiré",
          description: "Le lien d'invitation a expiré. Veuillez contacter un administrateur pour obtenir un nouveau lien.",
          variant: "destructive",
        });
        navigate("/auth", { replace: true });
        return;
      }
      
      // Valid link if we have token and correct type, or flow marker
      if ((accessToken && (type === 'invite' || type === 'recovery' || type === 'signup')) || 
          (flow === 'invite' || flow === 'recovery')) {
        setIsValidLink(true);
      } else {
        // Check if already authenticated
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          navigate("/", { replace: true });
        } else {
          // No valid link and not authenticated - redirect to auth
          navigate("/auth", { replace: true });
        }
      }
    };

    checkAuthLink();
  }, [navigate, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate password
    const validationResult = passwordSchema.safeParse(password);
    if (!validationResult.success) {
      toast({
        title: "Mot de passe invalide",
        description: validationResult.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    // Check password confirmation
    if (password !== confirmPassword) {
      toast({
        title: "Erreur",
        description: "Les mots de passe ne correspondent pas",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Update user password
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

        // Also update hairdresser if applicable
        await supabase
          .from("hairdressers")
          .update({ password_set: true })
          .eq("user_id", data.user.id);
      }

      toast({
        title: "Mot de passe défini",
        description: "Votre compte est maintenant actif. Connexion en cours...",
      });

      // Role-based redirect
      if (data.user) {
        const { redirectPath } = await getRoleRedirect(data.user.id);
        navigate(redirectPath, { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la création du mot de passe",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const allRequirementsMet = passwordRequirements.every((req) => req.test(password));
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  if (!isValidLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-lg">Vérification...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <img src={oomLogo} alt="OOM Logo" className="h-24 w-auto" />
        </div>

        {/* Title */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold text-foreground">Créez votre mot de passe</h1>
          <p className="text-muted-foreground">
            Bienvenue dans l'équipe OOM ! Choisissez un mot de passe sécurisé pour protéger votre compte.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Password Field */}
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              Nouveau mot de passe
            </label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
                placeholder="Entrez votre mot de passe"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Password Requirements */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Critères de sécurité :</p>
            <div className="space-y-1.5">
              {passwordRequirements.map((req, index) => {
                const isMet = req.test(password);
                return (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    {isMet ? (
                      <Check className="h-4 w-4 text-success flex-shrink-0" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className={isMet ? "text-success" : "text-muted-foreground"}>
                      {req.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Confirm Password Field */}
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
              Confirmer le mot de passe
            </label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pr-10"
                placeholder="Confirmez votre mot de passe"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirmPassword.length > 0 && (
              <div className="flex items-center gap-2 text-sm mt-2">
                {passwordsMatch ? (
                  <>
                    <Check className="h-4 w-4 text-success" />
                    <span className="text-success">Les mots de passe correspondent</span>
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4 text-destructive" />
                    <span className="text-destructive">Les mots de passe ne correspondent pas</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full bg-muted hover:bg-foreground text-foreground hover:text-background transition-colors"
            disabled={isLoading || !allRequirementsMet || !passwordsMatch}
          >
            {isLoading ? "Création en cours..." : "Créer mon compte"}
          </Button>
        </form>

        {/* Security Note */}
        <div className="text-center text-xs text-muted-foreground">
          <p>🔒 Votre mot de passe est chiffré et sécurisé</p>
        </div>
      </div>
    </div>
  );
};

export default SetPassword;
