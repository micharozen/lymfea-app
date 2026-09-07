import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
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
    <div
      className="app-refonte flex min-h-dvh flex-col items-center justify-center"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 24px)', paddingBottom: 'calc(var(--app-safe-bottom, 0px) + 24px)' }}
    >
      <div className="w-full max-w-sm">
        <div className="greeting" style={{ textAlign: 'center' }}>
          <img
            src={brandLogos.monogramBlack}
            alt={brand.name}
            style={{ height: 40, width: 40, margin: '0 auto 14px' }}
          />
          <h1>{t('portal.loginTitle')}</h1>
          <div className="date">{t('portal.loginSubtitle')}</div>
        </div>

        <form className="form" onSubmit={handleLogin}>
          <div className="field">
            <label className="flab" htmlFor="portal-email">{t('portal.emailPlaceholder')}</label>
            <input
              id="portal-email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              autoComplete="email"
              required
            />
          </div>

          <div className="field">
            <label className="flab" htmlFor="portal-password">{t('portal.passwordPlaceholder')}</label>
            <input
              id="portal-password"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <p style={{ fontSize: 12.5, color: 'var(--clay-deep)', textAlign: 'center', margin: 0 }}>{error}</p>
          )}

          <button
            type="submit"
            className="btn-primary-lg"
            disabled={isLoading || !email || !password}
            style={{ marginTop: 4, opacity: isLoading || !email || !password ? 0.5 : 1 }}
          >
            {isLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : t('portal.loginButton')}
          </button>
        </form>

        <div className="flex flex-col items-center gap-3" style={{ marginTop: 22 }}>
          <Link to="/forgot-password" style={{ fontSize: 13.5, color: 'var(--ink-mute)' }}>
            {t('portal.forgotPassword')}
          </Link>
          <Link to="/portal/redeem" style={{ fontSize: 13.5 }}>
            {t('portal.redeemLink')}
          </Link>
        </div>
      </div>
    </div>
  );
}
