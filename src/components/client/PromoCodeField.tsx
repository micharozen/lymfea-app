import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgePercent, Loader2, X } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { normalizeVoucherCode } from '@/lib/voucherCode';
import { computePromoDiscount } from '@/lib/promo';
import type { AppliedPromo } from '@/pages/client/context/FlowContext';
import type { BasketItem } from '@/pages/client/context/CartContext';

/**
 * Saisie d'un code promo dans le tunnel de réservation.
 *
 * Un code ne remise que les soins qu'il cible : appliqué à un panier qui n'en
 * contient aucun, il est refusé avec un message explicite plutôt qu'accepté
 * sans effet. Le montant affiché ici reste indicatif — le serveur recalcule la
 * remise à partir du catalogue avant tout encaissement.
 */

interface PromoCodeFieldProps {
  hotelId: string;
  /** Identité du client, déjà saisie à l'étape précédente. Sert au plafond par
   *  client : sans elle, le refus n'arriverait qu'au moment de payer. */
  customerPhone?: string | null;
  customerEmail?: string | null;
  items: BasketItem[];
  appliedPromo: AppliedPromo | null;
  discount: number;
  currencySymbol: string;
  onApply: (promo: AppliedPromo) => void;
  onRemove: () => void;
  disabled?: boolean;
}

interface PromoLookupResult {
  found: boolean;
  reason?: 'not_found' | 'inactive' | 'expired' | 'not_yet_valid' | 'exhausted'
    | 'customer_limit_reached';
  id?: string;
  code?: string;
  discount_type?: 'percentage' | 'fixed_amount';
  discount_value?: number;
  eligible_treatment_ids?: string[];
}

/** Longueur minimale alignée sur lookup_promo_code. */
const MIN_PROMO_CODE_LENGTH = 3;

/** Clé de limitation des recherches, stable sur toute la session de réservation. */
function getAttemptKey(): string {
  const storageKey = 'promo_attempt_key';
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const created = `promo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    return `promo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function PromoCodeField({
  hotelId,
  customerPhone,
  customerEmail,
  items,
  appliedPromo,
  discount,
  currencySymbol,
  onApply,
  onRemove,
  disabled = false,
}: PromoCodeFieldProps) {
  const { t } = useTranslation('client');
  const [isOpen, setIsOpen] = useState(false);
  const [code, setCode] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = normalizeVoucherCode(code).length >= MIN_PROMO_CODE_LENGTH
    && !isChecking && !disabled;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsChecking(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('lookup_promo_code', {
        _hotel_id: hotelId,
        _code: normalizeVoucherCode(code),
        _attempt_key: getAttemptKey(),
        _phone: customerPhone || null,
        _email: customerEmail || null,
      });

      if (rpcError) {
        setError(
          rpcError.message?.includes('Too many')
            ? t('promoCode.errorTooMany')
            : t('promoCode.errorNotFound'),
        );
        return;
      }

      const result = data as unknown as PromoLookupResult | null;

      if (!result?.found) {
        if (result?.reason === 'expired' || result?.reason === 'not_yet_valid') {
          setError(t('promoCode.errorExpired'));
        } else if (result?.reason === 'exhausted') {
          setError(t('promoCode.errorExhausted'));
        } else if (result?.reason === 'customer_limit_reached') {
          setError(t('promoCode.errorCustomerLimit'));
        } else {
          setError(t('promoCode.errorNotFound'));
        }
        return;
      }

      const promo: AppliedPromo = {
        id: result.id!,
        code: result.code!,
        discountType: result.discount_type!,
        discountValue: Number(result.discount_value) || 0,
        eligibleTreatmentIds: result.eligible_treatment_ids || [],
      };

      // Code valable, mais aucun soin du panier n'entre dans son assiette :
      // l'appliquer afficherait une remise nulle sans explication.
      const preview = computePromoDiscount(
        items
          .filter((i) => !i.isPriceOnRequest)
          .map((i) => ({ treatmentId: i.id, lineTotal: i.price * i.quantity })),
        {
          id: promo.id,
          code: promo.code,
          discount_type: promo.discountType,
          discount_value: promo.discountValue,
          eligible_treatment_ids: promo.eligibleTreatmentIds,
        },
      );
      if (preview.discount <= 0) {
        setError(t('promoCode.errorNoEligibleTreatment'));
        return;
      }

      onApply(promo);
      setCode('');
      setIsOpen(false);
    } catch {
      setError(t('promoCode.errorGeneric'));
    } finally {
      setIsChecking(false);
    }
  };

  // Code appliqué : c'est la ligne « Remise » du récapitulatif qui l'affiche et
  // permet de le retirer. Un second rappel ici ferait doublon.
  if (appliedPromo) return null;

  // Replié : un lien aligné à droite, sous le prix — il prolonge le total
  // plutôt que d'ouvrir une colonne de lecture à gauche.
  if (!isOpen) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        className="ml-auto block text-xs text-gray-500 hover:text-gray-900 underline underline-offset-4 decoration-gray-300 hover:decoration-gray-900 transition-colors disabled:opacity-50"
      >
        {t('promoCode.cta')}
      </button>
    );
  }

  // Largeur contenue et calée à droite, dans le prolongement du prix : un code
  // fait quelques caractères, un champ pleine largeur déséquilibre le récapitulatif.
  return (
    <div className="ml-auto w-full max-w-[280px] space-y-1.5">
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={t('promoCode.placeholder')}
          autoComplete="off"
          autoCapitalize="characters"
          autoFocus
          className="flex-1 min-w-0 h-9 bg-gray-50 border-gray-200 text-gray-900 text-sm placeholder:text-gray-400 rounded-lg font-mono uppercase focus:border-brand-500 focus:ring-brand-500/20"
          disabled={isChecking}
        />
        {/* Couleurs du lieu quand il en a, sinon le noir du tunnel — même
            traitement que tous les boutons d'action du flow client. */}
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="h-9 px-4 shrink-0 rounded-lg bg-[var(--venue-button-bg,theme(colors.gray.900))] text-[var(--venue-button-text,#fff)] hover:bg-[var(--venue-button-bg,theme(colors.gray.900))] hover:opacity-90 text-xs font-medium tracking-wider transition-all duration-300 disabled:bg-gray-200 disabled:text-gray-400"
        >
          {isChecking
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : t('promoCode.apply')}
        </Button>
      </div>

      {error && <p className="text-xs text-red-400 text-right">{error}</p>}
    </div>
  );
}
