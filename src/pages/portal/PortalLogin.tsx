import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail, Lock, Loader2, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { brand, brandLogos } from '@/config/brand';

export default function PortalLogin() {
  const { t } = useTranslation('client');
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError) {
        setError(t('portal.loginError'));
        return;
      }

      if (!data.user) {
        setError(t('portal.loginError'));
        return;
      }

      // Verify customer role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', data.user.id)
        .eq('role', 'user')
        .maybeSingle();

      if (!roleData) {
        await supabase.auth.signOut();
        setError(t('portal.loginNoAccess'));
        return;
      }

      navigate('/portal/dashboard');
    } catch {
      setError(t('portal.loginError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-gray-50 to-rose-50/30 flex flex-col items-center justify-center p-4 pb-safe pt-safe">
      <div className="w-full max-w-sm space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Header */}
        <div className="flex flex-col items-center text-center space-y-4">
          <img src={brandLogos.monogramBlack} alt={brand.name} className="h-12 w-12" />
          <div className="space-y-2">
            <h1 className="text-2xl font-serif text-gray-900">{t('portal.loginTitle')}</h1>
            <p className="text-sm text-gray-500">{t('portal.loginSubtitle')}</p>
          </div>
        </div>

        {/* Login form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              placeholder={t('portal.emailPlaceholder')}
              className="h-12 pl-10 rounded-xl border-gray-200 focus:border-gray-400 focus:ring-gray-400/20"
              autoComplete="email"
              required
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              placeholder={t('portal.passwordPlaceholder')}
              className="h-12 pl-10 rounded-xl border-gray-200 focus:border-gray-400 focus:ring-gray-400/20"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <p className="text-red-500 text-xs text-center">{error}</p>
          )}

          <Button
            type="submit"
            disabled={isLoading || !email || !password}
            className="w-full h-14 bg-gray-900 text-white hover:bg-gray-800 rounded-xl text-base font-medium shadow-md transition-all active:scale-[0.98] disabled:bg-gray-200 disabled:text-gray-400"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              t('portal.loginButton')
            )}
          </Button>
        </form>

        {/* Links */}
        <div className="flex flex-col items-center gap-3">
          <Link
            to="/forgot-password"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            {t('portal.forgotPassword')}
          </Link>

          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Gift className="w-4 h-4" />
            <Link
              to="/portal/redeem"
              className="hover:text-gray-600 transition-colors"
            >
              {t('portal.redeemLink')}
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 pt-4 opacity-40">
          <img src={brandLogos.monogramBlack} alt={brand.name} className="h-4 w-4" />
          <span className="text-xs text-gray-500 font-serif">{brand.name}</span>
        </div>
      </div>
    </div>
  );
}
