import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Mail } from "lucide-react";
import { brand, brandLogos } from "@/config/brand";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!email.trim()) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer votre adresse email",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/set-password`,
      });

      if (error) {
        toast({
          title: "Erreur",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      setEmailSent(true);
      toast({
        title: "Email envoyé",
        description: "Vérifiez votre boîte de réception",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <img src={brandLogos.primary} alt={brand.name} className="h-24 w-auto" />
        </div>

        {/* Title */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold text-foreground">
            Mot de passe oublié
          </h1>
          <p className="text-muted-foreground">
            {emailSent
              ? "Un email de réinitialisation a été envoyé"
              : "Entrez votre email pour recevoir un lien de réinitialisation"}
          </p>
        </div>

        {/* Content */}
        {emailSent ? (
          <div className="space-y-6">
            <div className="flex items-center justify-center">
              <div className="rounded-full bg-muted p-4">
                <Mail className="h-8 w-8 text-foreground" />
              </div>
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Si un compte existe avec l'adresse <span className="font-medium text-foreground">{email}</span>,
              vous recevrez un email avec un lien pour réinitialiser votre mot de passe.
            </p>
            <Link to="/login">
              <Button
                variant="outline"
                className="w-full h-14 text-base font-medium rounded-xl"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Retour à la connexion
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <Input
              type="email"
              placeholder="votre@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="w-full h-12 text-base"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />

            <Button
              onClick={handleSubmit}
              disabled={isLoading}
              className="w-full h-14 text-base font-medium rounded-xl bg-gray-400 hover:bg-black text-white transition-colors disabled:opacity-50"
            >
              {isLoading ? "Envoi en cours..." : "Envoyer le lien"}
              {isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            </Button>

            <Link
              to="/login"
              className="block text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="inline mr-1 h-4 w-4" />
              Retour à la connexion
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
