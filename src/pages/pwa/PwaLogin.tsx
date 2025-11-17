import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import oomLogo from "@/assets/oom-monogram.svg";

const PwaLogin = () => {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"input" | "password">("input");
  const [loginMethod, setLoginMethod] = useState<"email" | "phone">("email");
  const navigate = useNavigate();

  const handleCheckUser = async () => {
    setLoading(true);
    try {
      const identifier = loginMethod === "email" ? email : phone;
      
      // Check if hairdresser exists
      const { data: hairdresser, error } = await supabase
        .from("hairdressers")
        .select("email, user_id")
        .or(`email.eq.${identifier},phone.eq.${identifier}`)
        .single();

      if (error || !hairdresser) {
        toast.error("Compte non trouvé. Contactez l'administrateur.");
        return;
      }

      if (!hairdresser.user_id) {
        toast.error("Votre compte n'est pas encore activé. Contactez l'administrateur.");
        return;
      }

      setStep("password");
    } catch (error) {
      toast.error("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const identifier = loginMethod === "email" ? email : phone;
      
      // Get hairdresser email for login
      const { data: hairdresser } = await supabase
        .from("hairdressers")
        .select("email")
        .or(`email.eq.${identifier},phone.eq.${identifier}`)
        .single();

      if (!hairdresser) {
        toast.error("Erreur de connexion");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: hairdresser.email,
        password,
      });

      if (error) {
        toast.error("Email ou mot de passe incorrect");
        return;
      }

      // Check if first login (status is "En attente")
      const { data: hairdresserData } = await supabase
        .from("hairdressers")
        .select("status")
        .or(`email.eq.${identifier},phone.eq.${identifier}`)
        .single();

      if (hairdresserData?.status === "En attente") {
        toast.success("Première connexion !");
        navigate("/pwa/onboarding");
      } else {
        toast.success("Connexion réussie");
        navigate("/pwa/dashboard");
      }
    } catch (error) {
      toast.error("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center mb-6">
            <img 
              src={oomLogo} 
              alt="OOM" 
              className="w-24 h-24"
            />
          </div>
          <h1 className="text-2xl font-bold">Connexion Coiffeur</h1>
          <p className="text-muted-foreground mt-2">
            Accédez à votre espace professionnel
          </p>
        </div>

        {step === "input" ? (
          <div className="space-y-4">
            <Tabs value={loginMethod} onValueChange={(v) => setLoginMethod(v as "email" | "phone")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="email">Email</TabsTrigger>
                <TabsTrigger value="phone">Téléphone</TabsTrigger>
              </TabsList>
              
              <TabsContent value="email" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Adresse email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="votre@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </TabsContent>
              
              <TabsContent value="phone" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Numéro de téléphone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+33 6 12 34 56 78"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </TabsContent>
            </Tabs>

            <Button 
              onClick={handleCheckUser} 
              disabled={loading || (!email && !phone)}
              className="w-full"
            >
              {loading ? "Vérification..." : "Continuer"}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                placeholder="Entrez votre mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Button type="submit" disabled={loading || !password} className="w-full">
                {loading ? "Connexion..." : "Se connecter"}
              </Button>
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => {
                  setStep("input");
                  setPassword("");
                }}
                className="w-full"
              >
                Retour
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default PwaLogin;
