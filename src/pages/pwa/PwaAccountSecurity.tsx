import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Lock } from "lucide-react";
import { toast } from "sonner";

const PwaAccountSecurity = () => {
  const { t } = useTranslation('pwa');
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error(t('security.fillAllFields'));
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(t('security.passwordsNoMatch'));
      return;
    }

    if (newPassword.length < 6) {
      toast.error(t('security.passwordTooShort'));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast.success(t('security.passwordChanged'));
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      console.error("Error updating password:", error);
      toast.error(t('security.passwordError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-background border-b p-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/pwa/profile")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">{t('security.title')}</h1>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        <div className="flex items-start gap-3 text-muted-foreground">
          <Lock className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm">
            {t('security.recommendation')}
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new_password">{t('security.newPassword')}</Label>
            <Input
              id="new_password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm_password">{t('security.confirmPassword')}</Label>
            <Input
              id="confirm_password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
        </div>

        <Button
          className="w-full"
          onClick={handleChangePassword}
          disabled={loading}
        >
          {loading ? t('security.changing') : t('security.changePassword')}
        </Button>
      </div>
    </div>
  );
};

export default PwaAccountSecurity;
