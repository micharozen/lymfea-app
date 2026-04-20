import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Gift, Loader2, ArrowLeft, Calendar, Sparkles, CheckCircle, Clock, ShoppingBag, PartyPopper, Mail, User, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/lib/supabaseEdgeFunctions';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { brand, brandLogos } from '@/config/brand';
import { cn } from '@/lib/utils';

interface GiftCardData {
  bundle_type: string;
  title: string;
  title_en: string;
  cover_image_url: string | null;
  sender_name: string | null;
  gift_message: string | null;
  total_sessions: number | null;
  total_amount_cents: number | null;
  expires_at: string;
  hotel_id: string;
  hotel_name: string;
  already_claimed: boolean;
  is_gift: boolean;
  is_active: boolean;
  hotel_image: string | null;
  hotel_cover_image: string | null;
}

export default function RedeemGiftCard() {
  const { t, i18n } = useTranslation('client');
  const dateLocale = i18n.language === 'fr' ? fr : enUS;
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token');

  const formatCodeInput = (raw: string) => {
    return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  };

  const [code, setCode] = useState(tokenFromUrl ? formatCodeInput(tokenFromUrl) : '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardData, setCardData] = useState<GiftCardData | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [autoLookedUp, setAutoLookedUp] = useState(false);

  // Claim form state
  const [claimEmail, setClaimEmail] = useState('');
  const [claimName, setClaimName] = useState('');
  const [claimPassword, setClaimPassword] = useState('');
  const [claimPasswordConfirm, setClaimPasswordConfirm] = useState('');
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [existingAccount, setExistingAccount] = useState(false);

  const handleLookup = async () => {
    const cleanCode = formatCodeInput(code);
    if (cleanCode.length !== 10) return;

    setIsLoading(true);
    setError(null);

    try {
      const attemptKey = `portal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const { data, error: rpcError } = await supabase.rpc('lookup_gift_card_by_code', {
        _code: cleanCode,
        _attempt_key: attemptKey,
      });

      if (rpcError) {
        const msg = rpcError.message || '';
        if (msg.includes('not found')) setError(t('portal.errorNotFound'));
        else if (msg.includes('Too many')) setError(t('portal.errorTooMany'));
        else if (msg.includes('Invalid code')) setError(t('portal.errorNotFound'));
        else setError(t('portal.errorGeneric'));
        return;
      }

      if (!data || data.length === 0) {
        setError(t('portal.errorNotFound'));
        return;
      }

      setCardData(data[0] as GiftCardData);
    } catch {
      setError(t('portal.errorGeneric'));
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-lookup when arriving via token link
  useEffect(() => {
    if (tokenFromUrl && !autoLookedUp && !cardData) {
      setAutoLookedUp(true);
      handleLookup();
    }
  }, [tokenFromUrl]);

  const handleClaim = async () => {
    if (!claimEmail.trim() || !claimEmail.includes('@')) return;
    if (claimPassword.length < 6) {
      setClaimError(t('portal.claimErrorPasswordTooShort'));
      return;
    }
    if (claimPassword !== claimPasswordConfirm) {
      setClaimError(t('portal.claimErrorPasswordMismatch'));
      return;
    }

    setIsClaiming(true);
    setClaimError(null);

    try {
      const { data: result, error: fnError } = await invokeEdgeFunction<
        { code: string; email: string; password: string; firstName: string | null },
        { success: boolean; existingAccount?: boolean; error?: string }
      >('create-portal-account', {
        body: {
          code: formatCodeInput(code),
          email: claimEmail.trim(),
          password: claimPassword,
          firstName: claimName.trim() || null,
        },
        skipAuth: true,
      });

      if (fnError || !result?.success) {
        const msg = result?.error || fnError?.message || '';
        if (msg.includes('already claimed')) setClaimError(t('portal.claimErrorAlreadyClaimed'));
        else if (msg.includes('expired')) setClaimError(t('portal.claimErrorExpired'));
        else if (msg.includes('not found')) setClaimError(t('portal.errorNotFound'));
        else if (msg.includes('already exists') || result?.existingAccount) {
          setExistingAccount(true);
          setClaimError(null);
        } else setClaimError(msg || t('portal.claimErrorGeneric'));
        return;
      }

      if (result.existingAccount) {
        setExistingAccount(true);
        // Bundle was claimed but user needs to log in with existing credentials
        setClaimSuccess(true);
        setCardData(prev => prev ? { ...prev, is_active: true, already_claimed: true } : prev);
        return;
      }

      // Auto-login with the new account
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: claimEmail.trim().toLowerCase(),
        password: claimPassword,
      });

      if (!signInError) {
        navigate('/portal/dashboard');
        return;
      }

      // Fallback: show success and redirect to login
      setClaimSuccess(true);
      setCardData(prev => prev ? { ...prev, is_active: true, already_claimed: true } : prev);
    } catch {
      setClaimError(t('portal.claimErrorGeneric'));
    } finally {
      setIsClaiming(false);
    }
  };

  const handleBack = () => {
    setCardData(null);
    setError(null);
    setCode('');
    setClaimEmail('');
    setClaimName('');
    setClaimPassword('');
    setClaimPasswordConfirm('');
    setClaimError(null);
    setClaimSuccess(false);
    setExistingAccount(false);
  };

  const isExpired = cardData ? new Date(cardData.expires_at) < new Date() : false;
  const isAmountType = cardData?.bundle_type === 'gift_amount';
  const coverImage = cardData?.hotel_cover_image || cardData?.cover_image_url;
  const title = i18n.language === 'en' && cardData?.title_en ? cardData.title_en : cardData?.title;

  // ---------------------------------------------------------------------------
  // CARD REVEALED — venue-branded gift card view
  // ---------------------------------------------------------------------------
  if (cardData) {
    return (
      <div className="min-h-dvh bg-white flex flex-col items-center p-4 pb-safe pt-safe">
        <div className="w-full max-w-md space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 py-8">

          {/* Co-branding: Venue logo × Eïa */}
          <div className="flex items-center justify-center gap-3">
            {cardData.hotel_image ? (
              <img
                src={cardData.hotel_image}
                alt={cardData.hotel_name}
                className="h-8 w-auto object-contain"
              />
            ) : (
              <span className="text-gray-900 font-serif text-base tracking-wide">{cardData.hotel_name}</span>
            )}
            <span className="text-gray-300 text-lg font-light select-none">×</span>
            <img
              src={brandLogos.monogramBlack}
              alt={brand.name}
              className="h-6 w-6"
            />
          </div>

          {/* Gift card */}
          <div className="rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            {/* Card header with cover image */}
            {cardData.cover_image_url && (
              <div className="h-44 relative overflow-hidden">
                <img
                  src={cardData.cover_image_url}
                  className="h-full w-full object-cover"
                  alt=""
                />
              </div>
            )}

            <div className="p-6 space-y-5">
              {/* Title + Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gift className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-serif text-gray-900">{title}</span>
                </div>
                <span className={cn(
                  "text-xs font-medium px-2.5 py-1 rounded-full",
                  isExpired
                    ? "bg-red-50 text-red-600"
                    : cardData.is_active
                      ? "bg-green-50 text-green-700"
                      : "bg-amber-50 text-amber-700"
                )}>
                  {isExpired
                    ? t('portal.cardExpired')
                    : cardData.is_active
                      ? t('portal.cardActive')
                      : t('portal.cardPendingClaim')
                  }
                </span>
              </div>

              {/* Amount / Sessions */}
              <div className="text-center py-6 border-y border-gray-50">
                {isAmountType && cardData.total_amount_cents ? (
                  <p className="text-5xl font-serif font-light text-gray-900 tracking-tight">
                    {Math.round(cardData.total_amount_cents / 100)} <span className="text-3xl">€</span>
                  </p>
                ) : cardData.total_sessions ? (
                  <p className="text-5xl font-serif font-light text-gray-900 tracking-tight">
                    {cardData.total_sessions} <span className="text-2xl text-gray-400">
                      {cardData.total_sessions > 1 ? t('portal.sessions_plural', { count: cardData.total_sessions }).replace(`${cardData.total_sessions} `, '') : t('portal.sessions', { count: 1 }).replace('1 ', '')}
                    </span>
                  </p>
                ) : null}
              </div>

              {/* Details */}
              <div className="space-y-3">
                <div className="flex items-center gap-2.5 text-sm text-gray-500">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span>
                    {t('portal.validUntil', { date: format(new Date(cardData.expires_at), 'd MMMM yyyy', { locale: dateLocale }) })}
                  </span>
                </div>

                {cardData.sender_name && (
                  <div className="flex items-center gap-2.5 text-sm text-gray-500">
                    <Sparkles className="w-4 h-4 text-gray-400" />
                    <span>{t('portal.fromSender', { name: cardData.sender_name })}</span>
                  </div>
                )}
              </div>

              {/* Gift message */}
              {cardData.gift_message && (
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-sm text-gray-600 italic leading-relaxed">
                    "{cardData.gift_message}"
                  </p>
                </div>
              )}

              {/* Existing account — redirect to login */}
              {existingAccount && (
                <div className="space-y-3 pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <CheckCircle className="w-5 h-5 text-blue-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-blue-800">{t('portal.existingAccountTitle')}</p>
                      <p className="text-xs text-blue-600 mt-0.5">{t('portal.existingAccountMessage')}</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => navigate('/portal/login')}
                    className="w-full h-12 bg-gray-900 text-white hover:bg-gray-800 rounded-xl font-medium"
                  >
                    {t('portal.goToLogin')}
                  </Button>
                </div>
              )}

              {/* Claim form for unclaimed gifts */}
              {!isExpired && !cardData.is_active && !claimSuccess && !existingAccount && (
                <div className="space-y-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-sm text-amber-700">
                    <Clock className="w-4 h-4 shrink-0" />
                    <span>{t('portal.giftPendingClaim')}</span>
                  </div>

                  <h3 className="text-sm font-medium text-gray-900">{t('portal.claimTitle')}</h3>
                  <p className="text-xs text-gray-500">{t('portal.claimCreateAccount')}</p>

                  <div className="space-y-3">
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        type="email"
                        value={claimEmail}
                        onChange={(e) => { setClaimEmail(e.target.value); setClaimError(null); }}
                        placeholder={t('portal.claimEmailPlaceholder')}
                        className="h-12 pl-10 rounded-xl border-gray-200 focus:border-gray-400 focus:ring-gray-400/20"
                      />
                    </div>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        value={claimName}
                        onChange={(e) => setClaimName(e.target.value)}
                        placeholder={t('portal.claimNamePlaceholder')}
                        className="h-12 pl-10 rounded-xl border-gray-200 focus:border-gray-400 focus:ring-gray-400/20"
                      />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        type="password"
                        value={claimPassword}
                        onChange={(e) => { setClaimPassword(e.target.value); setClaimError(null); }}
                        placeholder={t('portal.claimPasswordPlaceholder')}
                        className="h-12 pl-10 rounded-xl border-gray-200 focus:border-gray-400 focus:ring-gray-400/20"
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        type="password"
                        value={claimPasswordConfirm}
                        onChange={(e) => { setClaimPasswordConfirm(e.target.value); setClaimError(null); }}
                        placeholder={t('portal.claimPasswordConfirmPlaceholder')}
                        className="h-12 pl-10 rounded-xl border-gray-200 focus:border-gray-400 focus:ring-gray-400/20"
                        autoComplete="new-password"
                      />
                    </div>
                  </div>

                  {claimError && (
                    <p className="text-red-500 text-xs">{claimError}</p>
                  )}

                  <Button
                    onClick={handleClaim}
                    disabled={!claimEmail.includes('@') || claimPassword.length < 6 || claimPassword !== claimPasswordConfirm || isClaiming}
                    className="w-full h-12 bg-gray-900 text-white hover:bg-gray-800 rounded-xl font-medium shadow-sm transition-all active:scale-[0.98] disabled:bg-gray-200 disabled:text-gray-400"
                  >
                    {isClaiming ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('portal.claimLoading')}
                      </>
                    ) : (
                      <>
                        <Gift className="mr-2 h-4 w-4" />
                        {t('portal.claimButton')}
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Success state after claiming */}
              {claimSuccess && (
                <div className="space-y-3 pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-100">
                    <PartyPopper className="w-5 h-5 text-green-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-800">{t('portal.claimSuccess')}</p>
                      <p className="text-xs text-green-600 mt-0.5">{t('portal.claimSuccessMessage')}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Active status */}
              {!isExpired && cardData.is_active && !claimSuccess && (
                <div className="flex items-start gap-3 p-3 rounded-xl border bg-green-50/50 border-green-100">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {t('portal.selfPurchaseActive')}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* CTAs */}
          <div className="space-y-3">
            {(cardData.is_active || claimSuccess) && !isExpired && (
              <Button
                onClick={() => window.location.href = `/client/${cardData.hotel_id}/treatments`}
                className="w-full h-14 bg-gray-900 text-white hover:bg-gray-800 rounded-xl text-base font-medium shadow-sm transition-all active:scale-[0.98]"
              >
                <ShoppingBag className="mr-2 h-5 w-5" />
                {t('portal.bookTreatment')}
              </Button>
            )}
            <button
              onClick={handleBack}
              className="w-full flex items-center justify-center gap-2 h-12 text-gray-400 hover:text-gray-600 text-sm transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('portal.backToCode')}
            </button>
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

  // ---------------------------------------------------------------------------
  // TOKEN AUTO-LOOKUP — show loader while resolving
  // ---------------------------------------------------------------------------
  if (tokenFromUrl && !cardData) {
    return (
      <div className="min-h-dvh bg-white flex flex-col items-center justify-center p-4 pb-safe pt-safe">
        <div className="w-full max-w-sm space-y-8 animate-in fade-in duration-500">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-20 h-20 bg-[#03bfac]/10 rounded-full flex items-center justify-center">
              {error ? (
                <Gift className="w-10 h-10 text-[#03bfac]" strokeWidth={1.5} />
              ) : (
                <Loader2 className="w-10 h-10 text-[#03bfac] animate-spin" strokeWidth={1.5} />
              )}
            </div>
            {error ? (
              <div className="space-y-4">
                <p className="text-sm text-red-500">{error}</p>
                <Button
                  onClick={() => {
                    setError(null);
                    handleLookup();
                  }}
                  className="w-full h-12 bg-gray-900 text-white hover:bg-gray-800 rounded-xl font-medium"
                >
                  {t('portal.lookup')}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-gray-500">{t('portal.lookupLoading')}</p>
            )}
          </div>
          <div className="flex items-center justify-center gap-2 pt-8 opacity-40">
            <img src={brandLogos.monogramBlack} alt={brand.name} className="h-4 w-4" />
            <span className="text-xs text-gray-500 font-serif">{brand.name}</span>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // CODE ENTRY — manual fallback (no token in URL)
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-dvh bg-white flex flex-col items-center justify-center p-4 pb-safe pt-safe">
      <div className="w-full max-w-sm space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Header */}
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-20 h-20 bg-[#03bfac]/10 rounded-full flex items-center justify-center">
            <Gift className="w-10 h-10 text-[#03bfac]" strokeWidth={1.5} />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-serif text-gray-900">{t('portal.title')}</h1>
            <p className="text-sm text-gray-500">{t('portal.codeHint')}</p>
          </div>
        </div>

        {/* Code input */}
        <div className="space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider font-medium text-gray-500 mb-2 block">
              {t('portal.enterCode')}
            </label>
            <Input
              ref={inputRef}
              value={code}
              onChange={(e) => {
                setCode(formatCodeInput(e.target.value));
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && code.length === 10) handleLookup();
              }}
              placeholder={t('portal.codePlaceholder')}
              className={cn(
                "h-14 text-center text-xl font-mono tracking-[0.2em] uppercase bg-white border-gray-200 rounded-xl focus:border-gray-400 focus:ring-gray-400/20",
                error && "border-red-400"
              )}
              maxLength={10}
              autoFocus
            />
            <div className="flex items-center justify-between mt-2">
              {error ? (
                <p className="text-red-500 text-xs">{error}</p>
              ) : (
                <span />
              )}
              <p className="text-xs text-gray-400 tabular-nums">{code.length}/10</p>
            </div>
          </div>

          <Button
            onClick={handleLookup}
            disabled={code.length !== 10 || isLoading}
            className="w-full h-14 bg-gray-900 text-white hover:bg-gray-800 rounded-xl text-base font-medium shadow-md transition-all active:scale-[0.98] disabled:bg-gray-200 disabled:text-gray-400"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {t('portal.lookupLoading')}
              </>
            ) : (
              <>
                <Gift className="mr-2 h-5 w-5" />
                {t('portal.lookup')}
              </>
            )}
          </Button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 pt-8 opacity-40">
          <img src={brandLogos.monogramBlack} alt={brand.name} className="h-4 w-4" />
          <span className="text-xs text-gray-500 font-serif">{brand.name}</span>
        </div>
      </div>
    </div>
  );
}
