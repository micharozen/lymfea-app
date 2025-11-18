import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Check, Bell } from "lucide-react";
import { toast } from "sonner";
import oomLogo from "@/assets/oom-logo.svg";

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
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Header - same style as dashboard */}
        <div className="bg-black text-white p-6">
          <div className="flex justify-center mb-4">
            <img 
              src={oomLogo} 
              alt="OOM" 
              className="h-16"
            />
          </div>
          <h1 className="text-2xl font-bold text-center">Bienvenue sur OOM</h1>
          <p className="text-sm text-gray-300 text-center mt-2">Beauty Room Services</p>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <Card className="p-8 max-w-md w-full space-y-6 shadow-lg">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center">
                <Check className="h-10 w-10 text-white" strokeWidth={3} />
              </div>
            </div>
            
            <div className="text-center space-y-3">
              <h2 className="text-2xl font-bold">Compte créé !</h2>
              <p className="text-muted-foreground">
                Votre compte a été créé avec succès. Configurons votre profil pour commencer.
              </p>
            </div>

            <Button
              onClick={() => setStep("photo")}
              className="w-full h-12 bg-black hover:bg-gray-800 text-white"
              size="lg"
            >
              Commencer
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  if (step === "photo") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Header */}
        <div className="bg-black text-white p-6">
          <div className="flex justify-center mb-4">
            <img 
              src={oomLogo} 
              alt="OOM" 
              className="h-16"
            />
          </div>
          <h1 className="text-2xl font-bold text-center">Photo de profil</h1>
          <p className="text-sm text-gray-300 text-center mt-2">Étape 1 sur 2</p>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <Card className="p-8 max-w-md w-full space-y-6 shadow-lg">
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                Ajoutez une photo pour personnaliser votre profil
              </p>

              <div className="flex justify-center">
                <div className="relative inline-block">
                  <Avatar className="h-32 w-32 border-4 border-black">
                    <AvatarImage src={profileImage || undefined} />
                    <AvatarFallback className="bg-gray-200">
                      <Camera className="h-12 w-12 text-gray-400" />
                    </AvatarFallback>
                  </Avatar>
                  <label className="absolute bottom-0 right-0 bg-black text-white p-3 rounded-full cursor-pointer hover:bg-gray-800 transition-colors shadow-lg">
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
              </div>

              {uploading && (
                <p className="text-sm text-muted-foreground animate-pulse">
                  Téléchargement en cours...
                </p>
              )}
            </div>

            <div className="space-y-3">
              <Button
                onClick={() => setStep("notifications")}
                className="w-full h-12 bg-black hover:bg-gray-800 text-white"
                size="lg"
                disabled={uploading}
              >
                Continuer
              </Button>
              <Button
                onClick={() => setStep("notifications")}
                variant="outline"
                className="w-full h-12"
                disabled={uploading}
              >
                Passer cette étape
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-black text-white p-6">
          <div className="flex justify-center mb-4">
            <img 
              src={oomLogo} 
              alt="OOM" 
              className="h-16"
            />
          </div>
        <h1 className="text-2xl font-bold text-center">Notifications</h1>
        <p className="text-sm text-gray-300 text-center mt-2">Étape 2 sur 2</p>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <Card className="p-8 max-w-md w-full space-y-6 shadow-lg">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center">
              <Bell className="h-10 w-10 text-white" />
            </div>
          </div>
          
          <div className="text-center space-y-3">
            <h2 className="text-2xl font-bold">Restez informé</h2>
            <p className="text-muted-foreground">
              Recevez des notifications pour vos nouvelles réservations et mises à jour importantes
            </p>
          </div>

          <div className="space-y-3">
            <Button
              onClick={handleFinish}
              className="w-full h-12 bg-black hover:bg-gray-800 text-white"
              size="lg"
            >
              Activer les notifications
            </Button>
            <Button
              onClick={handleFinish}
              variant="outline"
              className="w-full h-12"
            >
              Configurer plus tard
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default PwaOnboarding;
