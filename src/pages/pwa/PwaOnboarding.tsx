import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Check, Bell, Lock, Eye, EyeOff, ArrowLeft } from "lucide-react";
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

      if (error) {
        // If same password error, treat as success (password already set)
        if (error.message?.includes('same_password') || error.code === 'same_password') {
          console.log("Password already set to this value, continuing...");
        } else {
          throw error;
        }
      }

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

      let { data: hairdresser } = await supabase
        .from("hairdressers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!hairdresser) {
        const fullPhone = user.user_metadata?.phone || "";
        let countryCode = "+33";
        let phoneNumber = "";
        
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

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

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

  const getStepNumber = () => {
    switch (step) {
      case "password": return 1;
      case "photo": return 2;
      case "notifications": return 3;
      default: return 0;
    }
  };

  if (step === "welcome") {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <img src={oomLogo} alt="OOM" className="h-12 mb-12" />
          
          <div className="w-16 h-16 rounded-full bg-black flex items-center justify-center mb-6">
            <Check className="h-8 w-8 text-white" strokeWidth={3} />
          </div>
          
          <h1 className="text-2xl font-semibold mb-2 text-center">
            {t('onboarding.welcome.accountCreated')}
          </h1>
          <p className="text-sm text-gray-500 text-center mb-12 max-w-xs">
            {t('onboarding.welcome.subtitle')}
          </p>

          <Button
            onClick={() => setStep("password")}
            className="w-full h-12 rounded-full bg-black text-white hover:bg-black/90"
          >
            {t('onboarding.welcome.start')}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "password") {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <div className="p-4">
          <button onClick={() => setStep("welcome")}>
            <ArrowLeft className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 flex flex-col px-6 pt-4">
          <p className="text-xs text-gray-400 mb-2">{t('onboarding.password.step')}</p>
          <h1 className="text-2xl font-semibold mb-2">{t('onboarding.password.heading')}</h1>
          <p className="text-sm text-gray-500 mb-8">{t('onboarding.password.subtitle')}</p>

          <div className="space-y-4 mb-8">
            <div className="space-y-2">
              <Label htmlFor="password">{t('onboarding.password.newPassword')}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-12 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
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
                  className="h-12 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {password && password.length < 6 && (
              <p className="text-xs text-red-500">{t('onboarding.password.minChars')}</p>
            )}
            {password && confirmPassword && password !== confirmPassword && (
              <p className="text-xs text-red-500">{t('onboarding.password.noMatch')}</p>
            )}
          </div>

          <Button
            onClick={handleSavePassword}
            disabled={savingPassword || !password || !confirmPassword || password !== confirmPassword || password.length < 6}
            className={`w-full h-12 rounded-full ${
              password && confirmPassword && password === confirmPassword && password.length >= 6
                ? "bg-black text-white hover:bg-black/90"
                : "bg-gray-200 text-gray-400"
            }`}
          >
            {savingPassword ? t('onboarding.password.saving') : t('onboarding.password.continue')}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "photo") {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <div className="p-4">
          <button onClick={() => setStep("password")}>
            <ArrowLeft className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 flex flex-col px-6 pt-4">
          <p className="text-xs text-gray-400 mb-2">{t('onboarding.photo.step')}</p>
          <h1 className="text-2xl font-semibold mb-2">{t('onboarding.photo.title')}</h1>
          <p className="text-sm text-gray-500 mb-8">{t('onboarding.photo.subtitle')}</p>

          <div className="flex justify-center mb-8">
            <div className="relative inline-block">
              <Avatar className="h-32 w-32 border-2 border-gray-200">
                <AvatarImage src={profileImage || undefined} />
                <AvatarFallback className="bg-gray-100">
                  <Camera className="h-12 w-12 text-gray-400" />
                </AvatarFallback>
              </Avatar>
              <label className="absolute bottom-0 right-0 bg-black text-white p-2.5 rounded-full cursor-pointer hover:bg-black/90 transition-colors">
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
            <p className="text-sm text-gray-500 text-center mb-4 animate-pulse">
              {t('onboarding.photo.uploading')}
            </p>
          )}

          <div className="space-y-3 mt-auto mb-8">
            <Button
              onClick={() => setStep("notifications")}
              disabled={uploading}
              className="w-full h-12 rounded-full bg-black text-white hover:bg-black/90"
            >
              {t('onboarding.photo.continue')}
            </Button>
            <Button
              onClick={() => setStep("notifications")}
              variant="ghost"
              disabled={uploading}
              className="w-full h-12 text-gray-500"
            >
              {t('onboarding.photo.skip')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Notifications step
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="p-4">
        <button onClick={() => setStep("photo")}>
          <ArrowLeft className="h-6 w-6" />
        </button>
      </div>

      <div className="flex-1 flex flex-col px-6 pt-4">
        <p className="text-xs text-gray-400 mb-2">{t('onboarding.notifications.step')}</p>
        <h1 className="text-2xl font-semibold mb-2">{t('onboarding.notifications.heading')}</h1>
        <p className="text-sm text-gray-500 mb-8">{t('onboarding.notifications.subtitle')}</p>

        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
            <Bell className="h-10 w-10 text-gray-600" />
          </div>
        </div>

        <div className="space-y-3 mt-auto mb-8">
          <Button
            onClick={handleFinish}
            className="w-full h-12 rounded-full bg-black text-white hover:bg-black/90"
          >
            {t('onboarding.notifications.enable')}
          </Button>
          <Button
            onClick={handleFinish}
            variant="ghost"
            className="w-full h-12 text-gray-500"
          >
            {t('onboarding.notifications.later')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PwaOnboarding;