import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Lock, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';

export interface SessionBundle {
  customer_bundle_id: string;
  bundle_name: string;
  bundle_name_en: string | null;
  bundle_type: 'cure' | 'gift_treatments';
  total_sessions: number;
  used_sessions: number;
  remaining_sessions: number;
  expires_at: string;
  eligible_treatment_ids: string[];
}

export interface AmountBundle {
  customer_bundle_id: string;
  bundle_name: string;
  bundle_name_en: string | null;
  cover_image_url: string | null;
  total_amount_cents: number;
  used_amount_cents: number;
  remaining_amount_cents: number;
  expires_at: string;
}

export interface AuthBundles {
  session_bundles: SessionBundle[];
  amount_bundles: AmountBundle[];
}

export interface AuthCustomerInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface GiftCardLoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hotelId: string;
  treatmentIds: string[];
  onSuccess: (bundles: AuthBundles, customer: AuthCustomerInfo) => void;
}

type View = 'login' | 'reset';

export function GiftCardLoginModal({
  open,
  onOpenChange,
  hotelId,
  treatmentIds,
  onSuccess,
}: GiftCardLoginModalProps) {
  const { t } = useTranslation('client');
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const resetState = () => {
    setView('login');
    setEmail('');
    setPassword('');
    setError(null);
    setResetSent(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetState();
    onOpenChange(nextOpen);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError || !data.user) {
        setError(t('giftCardLogin.loginError'));
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
        setError(t('giftCardLogin.noAccount'));
        return;
      }

      // Fetch customer info + bundles in parallel
      const [portalRes, bundlesRes] = await Promise.all([
        supabase.rpc('get_customer_portal_data'),
        supabase.rpc('detect_bundles_for_auth_customer', {
          _hotel_id: hotelId,
          _treatment_ids: treatmentIds,
        }),
      ]);

      if (portalRes.error || bundlesRes.error) {
        setError(t('giftCardLogin.fetchError'));
        return;
      }

      const portal = portalRes.data as any;
      const customerInfo: AuthCustomerInfo = {
        firstName: portal?.customer?.first_name || '',
        lastName: portal?.customer?.last_name || '',
        email: portal?.customer?.email || '',
        phone: portal?.customer?.phone || '',
      };

      const bundles = bundlesRes.data as unknown as AuthBundles;
      onSuccess(bundles, customerInfo);
      handleOpenChange(false);
    } catch {
      setError(t('giftCardLogin.loginError'));
    } finally {
      // Always sign out to keep client flow anonymous
      await supabase.auth.signOut();
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: `${window.location.origin}/portal/login` }
      );

      if (resetError) {
        setError(t('giftCardLogin.resetError'));
        return;
      }

      setResetSent(true);
    } catch {
      setError(t('giftCardLogin.resetError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm rounded-2xl p-6">
        {view === 'login' ? (
          <>
            <DialogHeader className="text-center space-y-1.5">
              <DialogTitle className="text-lg font-serif text-gray-900">
                {t('giftCardLogin.title')}
              </DialogTitle>
              <DialogDescription className="text-sm text-gray-500">
                {t('giftCardLogin.subtitle')}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleLogin} className="space-y-4 mt-4">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  placeholder={t('giftCardLogin.emailPlaceholder')}
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
                  placeholder={t('giftCardLogin.passwordPlaceholder')}
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
                className="w-full h-12 bg-gray-900 text-white hover:bg-gray-800 rounded-xl font-medium shadow-md transition-all active:scale-[0.98] disabled:bg-gray-200 disabled:text-gray-400"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  t('giftCardLogin.loginButton')
                )}
              </Button>

              <button
                type="button"
                onClick={() => { setView('reset'); setError(null); }}
                className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                {t('giftCardLogin.forgotPassword')}
              </button>
            </form>
          </>
        ) : (
          <>
            <DialogHeader className="text-center space-y-1.5">
              <DialogTitle className="text-lg font-serif text-gray-900">
                {t('giftCardLogin.resetTitle')}
              </DialogTitle>
              <DialogDescription className="text-sm text-gray-500">
                {t('giftCardLogin.resetSubtitle')}
              </DialogDescription>
            </DialogHeader>

            {resetSent ? (
              <div className="text-center space-y-3 mt-4">
                <p className="text-sm text-gray-600">{t('giftCardLogin.resetSent')}</p>
                <button
                  type="button"
                  onClick={() => { setView('login'); setResetSent(false); }}
                  className="text-sm text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1 mx-auto"
                >
                  <ArrowLeft className="w-3 h-3" />
                  {t('giftCardLogin.backToLogin')}
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4 mt-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); }}
                    placeholder={t('giftCardLogin.emailPlaceholder')}
                    className="h-12 pl-10 rounded-xl border-gray-200 focus:border-gray-400 focus:ring-gray-400/20"
                    autoComplete="email"
                    required
                  />
                </div>

                {error && (
                  <p className="text-red-500 text-xs text-center">{error}</p>
                )}

                <Button
                  type="submit"
                  disabled={isLoading || !email}
                  className="w-full h-12 bg-gray-900 text-white hover:bg-gray-800 rounded-xl font-medium shadow-md transition-all active:scale-[0.98] disabled:bg-gray-200 disabled:text-gray-400"
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    t('giftCardLogin.resetButton')
                  )}
                </Button>

                <button
                  type="button"
                  onClick={() => { setView('login'); setError(null); }}
                  className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1 justify-center"
                >
                  <ArrowLeft className="w-3 h-3" />
                  {t('giftCardLogin.backToLogin')}
                </button>
              </form>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
