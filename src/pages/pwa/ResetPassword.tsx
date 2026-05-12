import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, Check, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { brandLogos, brand } from "@/config/brand";
import { cn } from "@/lib/utils";

const PwaResetPassword = () => {
  const navigate = useNavigate();
  const { t } = useTranslation("pwa");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(null);

  // Supabase handles recovery tokens via the URL hash automatically; we just confirm
  // that a session is available before allowing the password update.
  useEffect(() => {
    const check = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setHasRecoverySession(!!session);
    };

    check();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasRecoverySession(true);
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async () => {
    if (!password || !confirmPassword) {
      toast.error(t("resetPassword.fillAllFields"));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t("resetPassword.noMatch"));
      return;
    }
    if (password.length < 6) {
      toast.error(t("resetPassword.tooShort"));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Make sure password_set reflects the new state for any therapist
      // account linked to this user — so they aren't routed back to onboarding.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("therapists")
          .update({ password_set: true })
          .eq("user_id", user.id);
      }

      toast.success(t("resetPassword.success"));
      navigate("/pwa/splash", { replace: true });
    } catch (error: any) {
      console.error("Reset password error:", error);
      toast.error(error?.message || t("resetPassword.error"));
    } finally {
      setLoading(false);
    }
  };

  if (hasRecoverySession === false) {
    return (
      <div className="min-h-screen flex flex-col bg-background items-center justify-center px-6">
        <img src={brandLogos.primary} alt={brand.name} className="h-12 mb-8" />
        <p className="text-sm text-muted-foreground text-center mb-6 max-w-sm">
          {t("resetPassword.invalidLink")}
        </p>
        <Button
          onClick={() => navigate("/pwa/login")}
          className="w-full max-w-sm h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {t("resetPassword.backToLogin")}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="p-4">
        <button onClick={() => navigate("/pwa/login")}>
          <ArrowLeft className="h-6 w-6" />
        </button>
      </div>

      <div className="flex-1 flex flex-col px-6 pt-4">
        <h1 className="text-2xl font-semibold mb-2">{t("resetPassword.title")}</h1>
        <p className="text-sm text-muted-foreground mb-8">{t("resetPassword.subtitle")}</p>

        <div className="space-y-4 mb-8">
          <div className="space-y-2">
            <Label htmlFor="new-password">{t("resetPassword.newPassword")}</Label>
            <div className="relative">
              <Input
                id="new-password"
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
            <Label htmlFor="confirm-password">{t("resetPassword.confirmPassword")}</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="h-12 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {password && password.length < 6 && (
            <p className="text-xs text-red-500">{t("resetPassword.tooShort")}</p>
          )}
          {password && confirmPassword && password !== confirmPassword && (
            <p className="text-xs text-red-500">{t("resetPassword.noMatch")}</p>
          )}
        </div>

        <Button
          onClick={handleSubmit}
          disabled={
            loading ||
            !password ||
            !confirmPassword ||
            password !== confirmPassword ||
            password.length < 6
          }
          className={cn(
            "w-full h-12 rounded-full",
            password && confirmPassword && password === confirmPassword && password.length >= 6
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground",
          )}
        >
          {loading ? (
            <>
              <Check className="mr-2 h-4 w-4" />
              {t("resetPassword.saving")}
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
            </>
          ) : (
            t("resetPassword.submit")
          )}
        </Button>
      </div>
    </div>
  );
};

export default PwaResetPassword;
