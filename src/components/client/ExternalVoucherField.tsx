import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ticket, Loader2 } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { isUsableVoucherCode, normalizeVoucherCode } from '@/lib/voucherCode';
import { useClientVenueOptional } from '@/pages/client/context/ClientVenueContext';
import type { SelectedBundle } from '@/pages/client/context/FlowContext';

/**
 * Saisie d'un bon acheté chez un revendeur externe (Wonderbox, Smartbox…).
 *
 * Le bon est un avoir en euros enregistré par le lieu : une fois résolu, il est
 * appliqué exactement comme une carte cadeau `gift_amount`, sans chemin de
 * paiement dédié. Le solde peut être inférieur au panier — l'étape de paiement
 * facture alors le reste à payer.
 */

interface ExternalVoucherFieldProps {
  hotelId: string;
  bookingTotalCents: number;
  onApply: (bundle: SelectedBundle) => void;
  /** Bon annoncé mais absent de la base : la réservation part en vérification
   *  chez le lieu au lieu d'être refusée — un bon valide peut simplement ne pas
   *  encore avoir été enregistré. */
  onSubmitForVerification: (code: string) => void;
  disabled?: boolean;
}

interface VoucherLookupResult {
  found: boolean;
  reason?: 'not_found' | 'expired' | 'depleted';
  customer_bundle_id?: string;
  reseller_name?: string | null;
  remaining_amount_cents?: number;
}

/** Clé de limitation des recherches, stable sur toute la session de réservation. */
function getAttemptKey(): string {
  const storageKey = 'voucher_attempt_key';
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const created = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    // Navigation privée ou stockage bloqué : une clé éphémère reste acceptable,
    // la limite serveur s'applique alors par tentative plutôt que par session.
    return `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function ExternalVoucherField({
  hotelId,
  bookingTotalCents,
  onApply,
  onSubmitForVerification,
  disabled = false,
}: ExternalVoucherFieldProps) {
  const { t } = useTranslation('client');
  // Réglage du lieu : un établissement qui ne travaille avec aucun revendeur
  // n'affiche pas le champ, et `lookup_external_voucher` refuse de son côté.
  const venueContext = useClientVenueOptional();
  const [isOpen, setIsOpen] = useState(false);
  const [code, setCode] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Non nul quand la référence est introuvable : on propose alors la
  // vérification par le lieu plutôt que de renvoyer le client à son erreur.
  const [unverifiedCode, setUnverifiedCode] = useState<string | null>(null);

  const canSubmit = isUsableVoucherCode(code) && !isChecking && !disabled;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsChecking(true);
    setError(null);
    setUnverifiedCode(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('lookup_external_voucher', {
        _hotel_id: hotelId,
        _code: normalizeVoucherCode(code),
        _attempt_key: getAttemptKey(),
      });

      if (rpcError) {
        setError(
          rpcError.message?.includes('Too many')
            ? t('externalVoucher.errorTooMany')
            : t('externalVoucher.errorNotFound'),
        );
        return;
      }

      const result = data as unknown as VoucherLookupResult | null;

      if (!result?.found) {
        // Expiré ou épuisé : le lieu a le bon en base et la réponse est ferme.
        // Introuvable : rien ne prouve que le bon est mauvais, on propose la
        // vérification manuelle.
        if (result?.reason === 'expired') setError(t('externalVoucher.errorExpired'));
        else if (result?.reason === 'depleted') setError(t('externalVoucher.errorDepleted'));
        else setUnverifiedCode(code.trim());
        return;
      }

      const remaining = result.remaining_amount_cents ?? 0;
      onApply({
        customerBundleId: result.customer_bundle_id!,
        bundleName: result.reseller_name || t('externalVoucher.defaultName'),
        bundleType: 'gift_amount',
        remainingAmountCents: remaining,
        amountToUseCents: Math.min(remaining, bookingTotalCents),
      });
      setCode('');
      setIsOpen(false);
    } catch {
      setError(t('externalVoucher.errorGeneric'));
    } finally {
      setIsChecking(false);
    }
  };

  // Lieu sans bons revendeurs : rien à proposer, pas même l'amorce.
  if (!venueContext?.venue.external_vouchers_enabled) {
    return null;
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-50"
      >
        <Ticket className="w-4 h-4" />
        {t('externalVoucher.cta')}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
          <Ticket className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">{t('externalVoucher.title')}</p>
          <p className="text-xs text-gray-500 mt-0.5">{t('externalVoucher.subtitle')}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
            setUnverifiedCode(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={t('externalVoucher.placeholder')}
          autoComplete="off"
          autoCapitalize="characters"
          className="flex-1 font-mono"
          disabled={isChecking}
        />
        <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
          {isChecking
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : t('externalVoucher.apply')}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {unverifiedCode && (
        <div className="rounded-lg bg-amber-50/80 border border-amber-200/60 p-3 space-y-2">
          <p className="text-xs text-amber-900">{t('externalVoucher.unknownTitle')}</p>
          <p className="text-[11px] text-amber-700">{t('externalVoucher.unknownExplanation')}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              onSubmitForVerification(unverifiedCode);
              setUnverifiedCode(null);
              setCode('');
              setIsOpen(false);
            }}
          >
            {t('externalVoucher.unknownContinue')}
          </Button>
        </div>
      )}
    </div>
  );
}
