import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Camera,
  Check,
  Bell,
  Eye,
  EyeOff,
  ArrowLeft,
  CalendarDays,
  Sparkles,
  Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { brand, brandLogos } from "@/config/brand";
import { oneSignalSubscribe } from "@/hooks/useOneSignal";

type Step =
  | "welcome"
  | "password"
  | "photo"
  | "notifications"
  | "tour-bookings"
  | "tour-agenda"
  | "tour-addTreatment";

const TOTAL_STEPS = 6; // password, photo, notifications, 3 tour slides

const STEP_NUMBER: Record<Step, number> = {
  welcome: 0,
  password: 1,
  photo: 2,
  notifications: 3,
  "tour-bookings": 4,
  "tour-agenda": 5,
  "tour-addTreatment": 6,
};

const PwaOnboarding = () => {
  const { t } = useTranslation("pwa");
  const [step, setStep] = useState<Step>("welcome");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [subscribingNotifications, setSubscribingNotifications] = useState(false);
  const navigate = useNavigate();

  const handleSavePassword = async () => {
    if (!password || !confirmPassword) {
      toast.error(t("onboarding.password.fillAllFields"));
      return;
    }

    if (password !== confirmPassword) {
      toast.error(t("onboarding.password.noMatch"));
      return;
    }

    if (password.length < 6) {
      toast.error(t("onboarding.password.tooShort"));
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        if (error.message?.includes("same_password") || (error as any).code === "same_password") {
          console.log("Password already set to this value, continuing...");
        } else {
          throw error;
        }
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("therapists")
          .update({ password_set: true })
          .eq("user_id", user.id);
      }

      toast.success(t("onboarding.password.success"));
      setStep("photo");
    } catch (error: any) {
      console.error("Error setting password:", error);
      toast.error(t("onboarding.password.error"));
    } finally {
      setSavingPassword(false);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not found");

      let { data: therapist } = await supabase
        .from("therapists")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!therapist) {
        const fullPhone = (user.user_metadata as any)?.phone || "";
        let countryCode = "+33";
        let phoneNumber = "";

        if (fullPhone.startsWith("+")) {
          const match = fullPhone.match(/^(\+\d{1,4})(\d+)$/);
          if (match) {
            countryCode = match[1];
            phoneNumber = match[2];
          }
        }

        const { data: newTherapist, error: createError } = await supabase
          .from("therapists")
          .insert({
            user_id: user.id,
            email: user.email!,
            first_name: (user.user_metadata as any)?.first_name || "",
            last_name: (user.user_metadata as any)?.last_name || "",
            phone: phoneNumber,
            country_code: countryCode,
            status: "pending",
          })
          .select("id")
          .single();

        if (createError) throw createError;
        therapist = newTherapist;
      }

      if (!therapist) throw new Error("Failed to get or create therapist");

      const fileExt = file.name.split(".").pop();
      const fileName = `${therapist.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from("therapists")
        .update({ profile_image: publicUrl })
        .eq("id", therapist.id);

      if (updateError) throw updateError;

      setProfileImage(publicUrl);
      toast.success(t("onboarding.photo.uploadSuccess"));
    } catch (error: any) {
      console.error("Error uploading image:", error);
      toast.error(t("onboarding.photo.uploadError"));
    } finally {
      setUploading(false);
    }
  };

  const handleEnableNotifications = async () => {
    setSubscribingNotifications(true);
    try {
      const subscribed = await oneSignalSubscribe();
      if (subscribed) {
        toast.success(t("onboarding.notifications.enabled"));
      } else {
        toast.info(t("onboarding.notifications.notEnabled"));
      }
    } catch (error) {
      console.error("Error subscribing to notifications:", error);
    } finally {
      setSubscribingNotifications(false);
      setStep("tour-bookings");
    }
  };

  const handleFinish = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from("therapists").update({ status: "active" }).eq("user_id", user.id);

      toast.success(t("onboarding.complete", { brandName: brand.name }));
      navigate("/pwa/dashboard");
    } catch (error) {
      console.error("Error completing onboarding:", error);
      navigate("/pwa/dashboard");
    }
  };

  const ProgressIndicator = () => {
    const current = STEP_NUMBER[step];
    if (current === 0) return null;
    return (
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">
            {t("onboarding.stepIndicator", { current, total: TOTAL_STEPS })}
          </p>
        </div>
        <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(current / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>
    );
  };

  if (step === "welcome") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <img src={brandLogos.primary} alt={brand.name} className="h-12 mb-12" />

          <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center mb-6">
            <Check className="h-8 w-8 text-primary-foreground" strokeWidth={3} />
          </div>

          <h1 className="text-2xl font-semibold mb-2 text-center">
            {t("onboarding.welcome.accountCreated")}
          </h1>
          <p className="text-sm text-muted-foreground text-center mb-12 max-w-xs">
            {t("onboarding.welcome.subtitle")}
          </p>

          <Button
            onClick={() => setStep("password")}
            className="w-full h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {t("onboarding.welcome.start")}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "password") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <div className="p-4">
          <button onClick={() => setStep("welcome")}>
            <ArrowLeft className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 flex flex-col px-6 pt-4">
          <ProgressIndicator />
          <h1 className="text-2xl font-semibold mb-2">{t("onboarding.password.heading")}</h1>
          <p className="text-sm text-muted-foreground mb-8">{t("onboarding.password.subtitle")}</p>

          <div className="space-y-4 mb-8">
            <div className="space-y-2">
              <Label htmlFor="password">{t("onboarding.password.newPassword")}</Label>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t("onboarding.password.confirmPassword")}</Label>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {password && password.length < 6 && (
              <p className="text-xs text-red-500">{t("onboarding.password.minChars")}</p>
            )}
            {password && confirmPassword && password !== confirmPassword && (
              <p className="text-xs text-red-500">{t("onboarding.password.noMatch")}</p>
            )}
          </div>

          <Button
            onClick={handleSavePassword}
            disabled={
              savingPassword ||
              !password ||
              !confirmPassword ||
              password !== confirmPassword ||
              password.length < 6
            }
            className={`w-full h-12 rounded-full ${
              password && confirmPassword && password === confirmPassword && password.length >= 6
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {savingPassword ? t("onboarding.password.saving") : t("onboarding.password.continue")}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "photo") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <div className="p-4">
          <button onClick={() => setStep("password")}>
            <ArrowLeft className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 flex flex-col px-6 pt-4">
          <ProgressIndicator />
          <h1 className="text-2xl font-semibold mb-2">{t("onboarding.photo.title")}</h1>
          <p className="text-sm text-muted-foreground mb-8">{t("onboarding.photo.subtitle")}</p>

          <div className="flex justify-center mb-8">
            <div className="relative inline-block">
              <Avatar className="h-32 w-32 border-2 border-border">
                <AvatarImage src={profileImage || undefined} />
                <AvatarFallback className="bg-muted">
                  <Camera className="h-12 w-12 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
              <label className="absolute bottom-0 right-0 bg-primary text-primary-foreground p-2.5 rounded-full cursor-pointer hover:bg-primary/90 transition-colors">
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
            <p className="text-sm text-muted-foreground text-center mb-4 animate-pulse">
              {t("onboarding.photo.uploading")}
            </p>
          )}

          <div className="space-y-3 mt-auto mb-8">
            <Button
              onClick={() => setStep("notifications")}
              disabled={uploading}
              className="w-full h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {t("onboarding.photo.continue")}
            </Button>
            <Button
              onClick={() => setStep("notifications")}
              variant="ghost"
              disabled={uploading}
              className="w-full h-12 text-muted-foreground"
            >
              {t("onboarding.photo.skip")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "notifications") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <div className="p-4">
          <button onClick={() => setStep("photo")}>
            <ArrowLeft className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 flex flex-col px-6 pt-4">
          <ProgressIndicator />
          <h1 className="text-2xl font-semibold mb-2">
            {t("onboarding.notifications.heading")}
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            {t("onboarding.notifications.subtitle")}
          </p>

          <div className="flex justify-center mb-8">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
              <Bell className="h-10 w-10 text-muted-foreground" />
            </div>
          </div>

          <div className="space-y-3 mt-auto mb-8">
            <Button
              onClick={handleEnableNotifications}
              disabled={subscribingNotifications}
              className="w-full h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {subscribingNotifications
                ? t("onboarding.notifications.enabling")
                : t("onboarding.notifications.enable")}
            </Button>
            <Button
              onClick={() => setStep("tour-bookings")}
              variant="ghost"
              disabled={subscribingNotifications}
              className="w-full h-12 text-muted-foreground"
            >
              {t("onboarding.notifications.later")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "tour-bookings") {
    return (
      <TourSlide
        icon={<Inbox className="h-10 w-10 text-primary" />}
        title={t("onboarding.tour.bookings.heading")}
        subtitle={t("onboarding.tour.bookings.subtitle")}
        progress={<ProgressIndicator />}
        onBack={() => setStep("notifications")}
        onNext={() => setStep("tour-agenda")}
        nextLabel={t("onboarding.tour.next")}
      />
    );
  }

  if (step === "tour-agenda") {
    return (
      <TourSlide
        icon={<CalendarDays className="h-10 w-10 text-primary" />}
        title={t("onboarding.tour.agenda.heading")}
        subtitle={t("onboarding.tour.agenda.subtitle")}
        progress={<ProgressIndicator />}
        onBack={() => setStep("tour-bookings")}
        onNext={() => setStep("tour-addTreatment")}
        nextLabel={t("onboarding.tour.next")}
      />
    );
  }

  // tour-addTreatment
  return (
    <TourSlide
      icon={<Sparkles className="h-10 w-10 text-primary" />}
      title={t("onboarding.tour.addTreatment.heading")}
      subtitle={t("onboarding.tour.addTreatment.subtitle")}
      progress={<ProgressIndicator />}
      onBack={() => setStep("tour-agenda")}
      onNext={handleFinish}
      nextLabel={t("onboarding.tour.finish")}
    />
  );
};

interface TourSlideProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  progress: React.ReactNode;
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
}

const TourSlide = ({ icon, title, subtitle, progress, onBack, onNext, nextLabel }: TourSlideProps) => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="p-4">
        <button onClick={onBack}>
          <ArrowLeft className="h-6 w-6" />
        </button>
      </div>

      <div className="flex-1 flex flex-col px-6 pt-4">
        {progress}

        <div className="flex flex-col items-center text-center mt-8">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
            {icon}
          </div>
          <h1 className="text-2xl font-semibold mb-3">{title}</h1>
          <p className="text-sm text-muted-foreground max-w-sm">{subtitle}</p>
        </div>

        <div className="mt-auto mb-8">
          <Button
            onClick={onNext}
            className="w-full h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {nextLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PwaOnboarding;
