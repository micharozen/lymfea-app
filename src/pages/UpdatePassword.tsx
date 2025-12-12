import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Lock, Eye, EyeOff } from "lucide-react";
import oomLogo from "@/assets/oom-logo.svg";

const UpdatePassword = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        // Not logged in, redirect to auth
        navigate("/auth", { replace: true });
        return;
      }

      // Check if user must change password
      const { data: concierge } = await supabase
        .from("concierges")
        .select("must_change_password")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!concierge?.must_change_password) {
        // No need to change password, redirect to appropriate page
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (roles?.role === 'admin' || roles?.role === 'concierge') {
          navigate("/admin", { replace: true });
        } else {
          navigate("/", { replace: true });
        }
        return;
      }

      setIsCheckingAuth(false);
    };

    checkAuth();
  }, [navigate]);

  const handleSubmit = async () => {
    // Validation
    if (!newPassword.trim() || newPassword.length < 6) {
      toast({
        title: "Erreur",
        description: "Le mot de passe doit contenir au moins 6 caractères",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Erreur",
        description: "Les mots de passe ne correspondent pas",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Update password in Supabase Auth
      const { error: authError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (authError) {
        throw authError;
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error("Utilisateur non trouvé");
      }

      // Clear the must_change_password flag
      const { error: updateError } = await supabase
        .from("concierges")
        .update({ must_change_password: false })
        .eq("user_id", user.id);

      if (updateError) {
        console.error("Error clearing password flag:", updateError);
        // Non-fatal, continue anyway
      }

      toast({
        title: "Succès",
        description: "Votre mot de passe a été mis à jour",
      });

      // Redirect to admin dashboard
      navigate("/admin", { replace: true });
    } catch (error: any) {
      console.error("Password update error:", error);
      toast({
        title: "Erreur",
        description: error.message || "Erreur lors de la mise à jour du mot de passe",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <Lock className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            Changement de mot de passe requis
          </h1>
          <p className="text-muted-foreground">
            Pour des raisons de sécurité, veuillez créer un nouveau mot de passe
          </p>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Nouveau mot de passe (min. 6 caractères)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isLoading}
              className="w-full h-12 text-base pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          <div className="relative">
            <Input
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Confirmer le mot de passe"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              className="w-full h-12 text-base pr-10"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            className="w-full h-14 text-base font-medium rounded-xl bg-gray-400 hover:bg-black text-white transition-colors disabled:opacity-50"
          >
            {isLoading ? "Mise à jour..." : "Mettre à jour le mot de passe"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UpdatePassword;
