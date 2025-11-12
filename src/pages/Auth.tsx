import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import oomLogo from "@/assets/oom-logo.svg";

const Auth = () => {
  const [loginMethod, setLoginMethod] = useState<"email" | "phone">("email");
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Redirect if already authenticated
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/", { replace: true });
      }
    });
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
      // For now, we'll implement email login only
      // Phone authentication would require OTP setup
      const { error } = await supabase.auth.signInWithOtp({
        email: emailOrPhone,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) {
        toast({
          title: "Erreur",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Email envoyé",
        description: "Veuillez vérifier votre email pour vous connecter",
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
          <img src={oomLogo} alt="OOM Logo" className="h-24 w-auto" />
        </div>

        {/* Title */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold text-foreground">Sign in with OOM</h1>
          <p className="text-muted-foreground">Enter your phone number or email</p>
        </div>

        {/* Tabs */}
        <div className="flex justify-center gap-8 border-b border-border">
          <button
            onClick={() => setLoginMethod("phone")}
            className={`pb-3 text-sm font-medium transition-colors ${
              loginMethod === "phone"
                ? "text-foreground border-b-2 border-foreground"
                : "text-muted-foreground"
            }`}
            disabled={isLoading}
          >
            Phone number
          </button>
          <button
            onClick={() => setLoginMethod("email")}
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

        {/* Input */}
        <div className="space-y-6">
          <Input
            type={loginMethod === "email" ? "email" : "tel"}
            placeholder={loginMethod === "email" ? "yourname@mail.com" : "+33 6 12 34 56 78"}
            value={emailOrPhone}
            onChange={(e) => setEmailOrPhone(e.target.value)}
            disabled={isLoading}
            className="w-full h-12 text-base"
          />

          {/* Next Button */}
          <Button
            onClick={handleNext}
            disabled={isLoading}
            className="w-full h-12 text-base bg-muted hover:bg-muted/80 text-muted-foreground"
          >
            {isLoading ? "Chargement..." : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Auth;
