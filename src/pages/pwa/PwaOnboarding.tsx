import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Check, Bell, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import oomLogo from "@/assets/oom-logo.svg";

const PwaOnboarding = () => {
  const { t } = useTranslation('pwa');
  const [step, setStep] = useState<"welcome" | "password" | "photo" | "notifications">("welcome");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const navigate = useNavigate();

  const handleSavePassword = async () => {
    if (!password || !confirmPassword) {
      toast.error(t('onboarding.password.fillAllFields'));
      return;
    }

    if (password !== confirmPassword) {
      toast.error(t('onboarding.password.noMatch'));
      return;
    }

    if (password.length < 6) {
      toast.error(t('onboarding.password.tooShort'));
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      // Update hairdresser to mark password as set
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("hairdressers")
          .update({ password_set: true })
          .eq("user_id", user.id);
      }

      toast.success(t('onboarding.password.success'));
      setStep("photo");
    } catch (error: any) {
      console.error("Error setting password:", error);
      toast.error(t('onboarding.password.error'));
    } finally {
      setSavingPassword(false);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not found");

      // Get or create hairdresser entry
      let { data: hairdresser } = await supabase
        .from("hairdressers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      // If hairdresser doesn't exist, create one
      if (!hairdresser) {
        // Extract country code and phone from user_metadata
        const fullPhone = user.user_metadata?.phone || "";
        let countryCode = "+33";
        let phoneNumber = "";
        
        // Parse phone number (format: "+33674678293")
        if (fullPhone.startsWith("+")) {
          const match = fullPhone.match(/^(\+\d{1,4})(\d+)$/);
          if (match) {
            countryCode = match[1];
            phoneNumber = match[2];
          }
        }

        const { data: newHairdresser, error: createError } = await supabase
          .from("hairdressers")
          .insert({
            user_id: user.id,
            email: user.email!,
            first_name: user.user_metadata?.first_name || "",
            last_name: user.user_metadata?.last_name || "",
            phone: phoneNumber,
            country_code: countryCode,
            status: "En attente"
          })
          .select("id")
          .single();

        if (createError) throw createError;
        hairdresser = newHairdresser;
      }

      if (!hairdresser) throw new Error("Failed to get or create hairdresser");

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
      toast.success(t('onboarding.photo.uploadSuccess'));
    } catch (error: any) {
      console.error("Error uploading image:", error);
      toast.error(t('onboarding.photo.uploadError'));
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

      toast.success(t('onboarding.complete'));
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
          <h1 className="text-2xl font-bold text-center">{t('onboarding.welcome.title')}</h1>
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
              <h2 className="text-2xl font-bold">{t('onboarding.welcome.accountCreated')}</h2>
              <p className="text-muted-foreground">
                {t('onboarding.welcome.subtitle')}
              </p>
            </div>

            <Button
              onClick={() => setStep("password")}
              className="w-full h-12 bg-black hover:bg-gray-800 text-white"
              size="lg"
            >
              {t('onboarding.welcome.start')}
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  if (step === "password") {
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
          <h1 className="text-2xl font-bold text-center">{t('onboarding.password.title')}</h1>
          <p className="text-sm text-gray-300 text-center mt-2">{t('onboarding.password.step')}</p>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <Card className="p-8 max-w-md w-full space-y-6 shadow-lg">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center">
                <Lock className="h-10 w-10 text-white" />
              </div>
            </div>
            
            <div className="text-center space-y-3">
              <h2 className="text-xl font-bold">{t('onboarding.password.heading')}</h2>
              <p className="text-muted-foreground text-sm">
                {t('onboarding.password.subtitle')}
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">{t('onboarding.password.newPassword')}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('onboarding.password.confirmPassword')}</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {password && password.length < 6 && (
                <p className="text-xs text-destructive">{t('onboarding.password.minChars')}</p>
              )}
              {password && confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-destructive">{t('onboarding.password.noMatch')}</p>
              )}
            </div>

            <Button
              onClick={handleSavePassword}
              className="w-full h-12 bg-black hover:bg-gray-800 text-white"
              size="lg"
              disabled={savingPassword || !password || !confirmPassword || password !== confirmPassword || password.length < 6}
            >
              {savingPassword ? t('onboarding.password.saving') : t('onboarding.password.continue')}
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
          <h1 className="text-2xl font-bold text-center">{t('onboarding.photo.title')}</h1>
          <p className="text-sm text-gray-300 text-center mt-2">{t('onboarding.photo.step')}</p>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <Card className="p-8 max-w-md w-full space-y-6 shadow-lg">
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                {t('onboarding.photo.subtitle')}
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
                  {t('onboarding.photo.uploading')}
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
                {t('onboarding.photo.continue')}
              </Button>
              <Button
                onClick={() => setStep("notifications")}
                variant="outline"
                className="w-full h-12"
                disabled={uploading}
              >
                {t('onboarding.photo.skip')}
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
        <h1 className="text-2xl font-bold text-center">{t('onboarding.notifications.title')}</h1>
        <p className="text-sm text-gray-300 text-center mt-2">{t('onboarding.notifications.step')}</p>
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
            <h2 className="text-2xl font-bold">{t('onboarding.notifications.heading')}</h2>
            <p className="text-muted-foreground">
              {t('onboarding.notifications.subtitle')}
            </p>
          </div>

          <div className="space-y-3">
            <Button
              onClick={handleFinish}
              className="w-full h-12 bg-black hover:bg-gray-800 text-white"
              size="lg"
            >
              {t('onboarding.notifications.enable')}
            </Button>
            <Button
              onClick={handleFinish}
              variant="outline"
              className="w-full h-12"
            >
              {t('onboarding.notifications.later')}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default PwaOnboarding;