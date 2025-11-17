import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Check } from "lucide-react";
import { toast } from "sonner";
import oomLogo from "@/assets/oom-monogram.svg";

const PwaOnboarding = () => {
  const [step, setStep] = useState<"welcome" | "photo" | "notifications">("welcome");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not found");

      // Get hairdresser ID
      const { data: hairdresser } = await supabase
        .from("hairdressers")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!hairdresser) throw new Error("Hairdresser not found");

      const fileExt = file.name.split(".").pop();
      const fileName = `${hairdresser.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError, data } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

      // Update hairdresser profile
      const { error: updateError } = await supabase
        .from("hairdressers")
        .update({ profile_image: publicUrl })
        .eq("id", hairdresser.id);

      if (updateError) throw updateError;

      setProfileImage(publicUrl);
      toast.success("Photo de profil ajoutée");
    } catch (error: any) {
      console.error("Error uploading image:", error);
      toast.error("Erreur lors de l'ajout de la photo");
    } finally {
      setUploading(false);
    }
  };

  const handleFinish = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Mark onboarding as complete
      await supabase
        .from("hairdressers")
        .update({ status: "Actif" })
        .eq("user_id", user.id);

      toast.success("Bienvenue sur OOM !");
      navigate("/pwa/dashboard");
    } catch (error) {
      console.error("Error completing onboarding:", error);
      navigate("/pwa/dashboard");
    }
  };

  if (step === "welcome") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="bg-black text-white p-6 text-center">
          <img 
            src={oomLogo} 
            alt="OOM" 
            className="w-16 h-16 mx-auto mb-4"
          />
          <h1 className="text-xl font-bold">Bienvenue sur OOM</h1>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-8">
          <div className="text-center space-y-4">
            <div className="w-24 h-24 mx-auto rounded-full bg-green-100 flex items-center justify-center">
              <Check className="h-12 w-12 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold">Compte créé avec succès !</h2>
            <p className="text-muted-foreground">
              Configurons votre profil pour commencer
            </p>
          </div>

          <Button
            onClick={() => setStep("photo")}
            className="w-full max-w-sm h-14 bg-black hover:bg-gray-800"
            size="lg"
          >
            Continuer
          </Button>
        </div>
      </div>
    );
  }

  if (step === "photo") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="bg-black text-white p-6 text-center">
          <img 
            src={oomLogo} 
            alt="OOM" 
            className="w-16 h-16 mx-auto mb-4"
          />
          <h1 className="text-xl font-bold">Photo de profil</h1>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-8">
          <div className="text-center space-y-6">
            <p className="text-muted-foreground">
              Ajoutez une photo de profil pour personnaliser votre compte
            </p>

            <div className="relative inline-block">
              <Avatar className="h-32 w-32 border-4 border-black">
                <AvatarImage src={profileImage || undefined} />
                <AvatarFallback className="bg-gray-200">
                  <Camera className="h-12 w-12 text-gray-400" />
                </AvatarFallback>
              </Avatar>
              <label className="absolute bottom-0 right-0 bg-black text-white p-3 rounded-full cursor-pointer hover:bg-gray-800 transition-colors">
                <Camera className="h-5 w-5" />
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploading}
                />
              </label>
            </div>

            {uploading && (
              <p className="text-sm text-muted-foreground">Téléchargement...</p>
            )}
          </div>

          <div className="w-full max-w-sm space-y-3">
            <Button
              onClick={() => setStep("notifications")}
              className="w-full h-14 bg-black hover:bg-gray-800"
              size="lg"
              disabled={uploading}
            >
              Continuer
            </Button>
            <Button
              onClick={() => setStep("notifications")}
              variant="ghost"
              className="w-full"
              disabled={uploading}
            >
              Passer
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-black text-white p-6 text-center">
        <img 
          src={oomLogo} 
          alt="OOM" 
          className="w-16 h-16 mx-auto mb-4"
        />
        <h1 className="text-xl font-bold">Notifications</h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-8">
        <Card className="p-6 text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 mx-auto rounded-full bg-blue-100 flex items-center justify-center">
            <span className="text-3xl">🔔</span>
          </div>
          <h2 className="text-xl font-bold">Activez les notifications</h2>
          <p className="text-sm text-muted-foreground">
            Recevez des alertes pour vos nouvelles réservations et mises à jour importantes
          </p>
        </Card>

        <div className="w-full max-w-sm space-y-3">
          <Button
            onClick={handleFinish}
            className="w-full h-14 bg-black hover:bg-gray-800"
            size="lg"
          >
            Activer les notifications
          </Button>
          <Button
            onClick={handleFinish}
            variant="ghost"
            className="w-full"
          >
            Plus tard
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PwaOnboarding;
