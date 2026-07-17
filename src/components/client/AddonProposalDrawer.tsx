import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X, Sparkles, Clock } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/formatPrice';
import { amenityWindow } from '@/lib/amenityWindow';
import { getAmenityLabel, getAmenityIcon } from '@/lib/amenityTypes';
import { useLocalizedField } from '@/hooks/useLocalizedField';
import { useBasket } from '@/pages/client/context/CartContext';
import { useClientFlow, type AmenityTiming } from '@/pages/client/context/FlowContext';
import type { FeasibleAddon } from '@/hooks/client/useFeasibleAddons';
import type { FeasibleAmenity } from '@/hooks/client/useFeasibleAmenities';

interface AddonProposalDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feasibleAddons: FeasibleAddon[];
  feasibleAmenities: FeasibleAmenity[];
  /** Formatted end time of the base slot (e.g. "12:50"). */
  baseEndTime: string;
  /** Heure de début du bloc soin "HH:MM" (pour la fenêtre de l'accès amenity). */
  soinStartTime: string;
  /** Durée cumulée des soins (référence pour placer l'accès « après »). */
  serviceDurationSum: number;
  onContinue: () => void;
}

export function AddonProposalDrawer({
  open,
  onOpenChange,
  feasibleAddons,
  feasibleAmenities,
  baseEndTime,
  soinStartTime,
  serviceDurationSum,
  onContinue,
}: AddonProposalDrawerProps) {
  const { t, i18n } = useTranslation('client');
  const locale = i18n.language?.startsWith('fr') ? 'fr' : 'en';
  const localize = useLocalizedField();
  const { addItem } = useBasket();
  const { setAmenityTiming } = useClientFlow();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [placement, setPlacement] = useState<AmenityTiming>('after');

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set());
      setPlacement('after');
    }
  }, [open]);

  const currency =
    feasibleAddons[0]?.addon.currency || feasibleAmenities[0]?.amenity.currency || 'EUR';

  const selectedAmenities = useMemo(
    () => feasibleAmenities.filter((f) => selectedIds.has(f.amenity.id)),
    [feasibleAmenities, selectedIds],
  );

  // Placements valides pour la sélection courante : partagés par tous les accès
  // choisis (le timing est unique dans FlowContext).
  const afterAvailable =
    selectedAmenities.length > 0 && selectedAmenities.every((a) => a.canAfter);
  const beforeAvailable =
    selectedAmenities.length > 0 && selectedAmenities.every((a) => a.canBefore);
  const hasCommonPlacement = afterAvailable || beforeAvailable;

  // Cale le placement par défaut sur une option valide dès qu'un accès est choisi.
  useEffect(() => {
    if (selectedAmenities.length === 0) return;
    if (placement === 'after' && !afterAvailable && beforeAvailable) setPlacement('before');
    if (placement === 'before' && !beforeAvailable && afterAvailable) setPlacement('after');
  }, [selectedAmenities.length, afterAvailable, beforeAvailable, placement]);

  const addedTotal = useMemo(() => {
    const addonSum = feasibleAddons
      .filter((f) => selectedIds.has(f.addon.id) && !f.addon.price_on_request)
      .reduce((sum, f) => sum + (Number(f.addon.price) || 0), 0);
    const amenitySum = selectedAmenities
      .filter((f) => !f.amenity.price_on_request)
      .reduce((sum, f) => sum + (Number(f.amenity.price) || 0), 0);
    return addonSum + amenitySum;
  }, [feasibleAddons, selectedIds, selectedAmenities]);

  const addedDuration = useMemo(() => {
    const addonDur = feasibleAddons
      .filter((f) => selectedIds.has(f.addon.id))
      .reduce((sum, f) => sum + (f.addon.duration || 0), 0);
    const amenityDur = selectedAmenities.reduce((sum, f) => sum + (f.amenity.duration || 0), 0);
    return addonDur + amenityDur;
  }, [feasibleAddons, selectedIds, selectedAmenities]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSkip = () => {
    onOpenChange(false);
    onContinue();
  };

  const handleConfirm = () => {
    for (const addonId of selectedIds) {
      const match = feasibleAddons.find((f) => f.addon.id === addonId);
      if (!match) continue;
      const { addon, parentKey } = match;
      addItem({
        id: addon.id,
        name: localize(addon.name, addon.name_en),
        price: Number(addon.price ?? 0) || 0,
        currency: addon.currency || 'EUR',
        duration: addon.duration ?? 0,
        image: addon.image || undefined,
        category: addon.category,
        isPriceOnRequest: addon.price_on_request ?? false,
        isAddon: true,
        parentCartKey: parentKey,
      });
    }

    for (const { amenity } of selectedAmenities) {
      addItem({
        id: amenity.id,
        name: localize(amenity.name, amenity.name_en),
        price: Number(amenity.price ?? 0) || 0,
        currency: amenity.currency || 'EUR',
        duration: amenity.duration ?? 0,
        image: amenity.image || undefined,
        category: amenity.category,
        isPriceOnRequest: amenity.price_on_request ?? false,
        isAmenity: true,
      });
    }

    // Placement partagé de l'accès (avant/après le soin) pour le flow mixte.
    if (selectedAmenities.length > 0) {
      setAmenityTiming(placement);
    }

    onOpenChange(false);
    onContinue();
  };

  const formatItemPrice = (price: number | null, priceOnRequest: boolean | null, cur: string) => {
    if (priceOnRequest) return t('payment.onQuote');
    return formatPrice(price ?? 0, cur || 'EUR', { decimals: 0 });
  };

  const count = selectedIds.size;
  const confirmDisabled = count === 0 || (selectedAmenities.length > 0 && !hasCommonPlacement);
  const confirmLabel =
    count === 0
      ? t('schedule.addons.confirmEmpty', 'Choisir un soin')
      : addedTotal > 0
        ? t('schedule.addons.confirmWithTotal', 'Ajouter · +{{total}}', {
            total: formatPrice(addedTotal, currency, { decimals: 0 }),
          })
        : t('schedule.addons.confirm', 'Ajouter');

  const singleAmenityWindow =
    selectedAmenities.length === 1
      ? amenityWindow(
          placement,
          soinStartTime,
          selectedAmenities[0].amenity.duration || 0,
          serviceDurationSum,
        )
      : null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="lymfea-client max-h-[92dvh] flex flex-col font-grotesk text-gray-900 bg-gradient-to-b from-gold-50 via-white to-white border-t border-gold-200/60">
        <DrawerHeader className="text-left border-b border-gold-100 pb-5 relative bg-gold-50/40">
          <button
            type="button"
            onClick={handleSkip}
            className="absolute top-3 right-4 p-1.5 rounded-full text-gold-700/60 hover:text-gold-800 hover:bg-gold-100 transition-colors"
            aria-label={t('schedule.addons.skip', 'Passer')}
          >
            <X className="h-5 w-5" />
          </button>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold-100/70 text-gold-800 text-[11px] font-medium tracking-wide uppercase mb-3">
            <Sparkles className="h-3 w-3" />
            {t('schedule.addons.badge', 'Prolongez votre parenthèse')}
          </div>

          <DrawerTitle className="font-serif text-xl sm:text-2xl text-gray-900 font-medium leading-tight pr-8">
            {t('schedule.addons.titleRich', 'Votre soin se termine à {{end}}', {
              end: baseEndTime,
            })}
          </DrawerTitle>
          <DrawerDescription asChild>
            <div className="text-sm text-gray-600 leading-relaxed font-light mt-2">
              {t(
                'schedule.addons.subtitleRich',
                "Ajoutez un soin qui s'enchaîne immédiatement — sans reprendre rendez-vous.",
              )}
            </div>
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          {/* Section add-ons (soins qui s'enchaînent). */}
          {feasibleAddons.length > 0 && (
            <div className="flex flex-col gap-3">
              {feasibleAddons.map((entry) => {
                const { addon } = entry;
                const isSelected = selectedIds.has(addon.id);
                const startHHMM = entry.startTime.slice(0, 5);
                return (
                  <button
                    key={addon.id}
                    type="button"
                    onClick={() => toggleSelection(addon.id)}
                    aria-pressed={isSelected}
                    className={cn(
                      'group w-full flex items-stretch gap-3 p-3 text-left rounded-2xl border transition-all duration-200',
                      isSelected
                        ? 'border-gold-500 bg-gold-50 shadow-[0_6px_20px_rgba(200,160,70,0.18)]'
                        : 'border-gold-100 bg-white hover:border-gold-300 hover:bg-gold-50/40',
                    )}
                  >
                    {addon.image ? (
                      <div className="shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-gold-50">
                        <img
                          src={addon.image}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="shrink-0 w-20 h-20 rounded-xl bg-gradient-to-br from-gold-100 to-gold-50 flex items-center justify-center">
                        <Sparkles className="h-5 w-5 text-gold-500" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-serif text-base sm:text-[17px] text-gray-900 font-medium leading-tight">
                            {localize(addon.name, addon.name_en)}
                          </span>
                          <span
                            className={cn(
                              'shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all mt-0.5',
                              isSelected ? 'border-gold-600 bg-gold-600' : 'border-gold-300 bg-white',
                            )}
                          >
                            {isSelected && (
                              <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                            )}
                          </span>
                        </div>
                        {(addon.description || addon.description_en) && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2 font-light">
                            {localize(addon.description, addon.description_en)}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-2">
                        <div className="flex items-center gap-2 text-[11px] text-gold-700/80 font-medium">
                          {addon.duration ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold-100/70">
                              +{addon.duration} min
                            </span>
                          ) : null}
                          <span className="inline-flex items-center gap-1 text-gray-500 font-light">
                            <Clock className="h-3 w-3" />
                            {startHHMM}
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-gray-900">
                          {formatItemPrice(addon.price, addon.price_on_request, addon.currency || 'EUR')}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Section amenity (accès aux installations du lieu). */}
          {feasibleAmenities.length > 0 && (
            <div className={cn('flex flex-col gap-3', feasibleAddons.length > 0 && 'mt-6')}>
              <div className="flex items-center gap-2 px-1">
                <span className="text-[11px] font-medium tracking-wide uppercase text-gold-800/80">
                  {t('schedule.amenities.sectionTitle', 'Profitez des installations')}
                </span>
                <span className="h-px flex-1 bg-gold-100" />
              </div>

              {feasibleAmenities.map(({ amenity }) => {
                const isSelected = selectedIds.has(amenity.id);
                const AmenityIcon = getAmenityIcon(amenity.amenity_type || '') ?? Sparkles;
                const label = amenity.amenity_type
                  ? getAmenityLabel(amenity.amenity_type, locale)
                  : null;
                return (
                  <button
                    key={amenity.id}
                    type="button"
                    onClick={() => toggleSelection(amenity.id)}
                    aria-pressed={isSelected}
                    className={cn(
                      'group w-full flex items-stretch gap-3 p-3 text-left rounded-2xl border transition-all duration-200',
                      isSelected
                        ? 'border-gold-500 bg-gold-50 shadow-[0_6px_20px_rgba(200,160,70,0.18)]'
                        : 'border-gold-100 bg-white hover:border-gold-300 hover:bg-gold-50/40',
                    )}
                  >
                    {amenity.image ? (
                      <div className="shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-gold-50">
                        <img
                          src={amenity.image}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="shrink-0 w-20 h-20 rounded-xl bg-gradient-to-br from-gold-100 to-gold-50 flex items-center justify-center">
                        <AmenityIcon className="h-6 w-6 text-gold-500" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-serif text-base sm:text-[17px] text-gray-900 font-medium leading-tight">
                            {localize(amenity.name, amenity.name_en)}
                          </span>
                          <span
                            className={cn(
                              'shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all mt-0.5',
                              isSelected ? 'border-gold-600 bg-gold-600' : 'border-gold-300 bg-white',
                            )}
                          >
                            {isSelected && (
                              <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                            )}
                          </span>
                        </div>
                        {label && (
                          <p className="text-xs text-gray-500 mt-1 font-light">{label}</p>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-2">
                        <div className="flex items-center gap-2 text-[11px] text-gold-700/80 font-medium">
                          {amenity.duration ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold-100/70">
                              {amenity.duration} min
                            </span>
                          ) : null}
                        </div>
                        <span className="text-sm font-semibold text-gray-900">
                          {formatItemPrice(
                            amenity.price,
                            amenity.price_on_request,
                            amenity.currency || 'EUR',
                          )}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* Placement avant/après le soin (une seule valeur partagée). */}
              {selectedAmenities.length > 0 && (
                <div className="mt-1 rounded-2xl border border-gold-100 bg-white p-3">
                  <p className="text-xs text-gray-600 font-light mb-2">
                    {t('schedule.amenities.placementLabel', 'Quand profiter de cet accès ?')}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPlacement('before')}
                      disabled={!beforeAvailable}
                      className={cn(
                        'h-10 rounded-full text-sm font-medium transition-colors',
                        placement === 'before' && beforeAvailable
                          ? 'bg-gold-500 text-black'
                          : 'bg-gold-50 text-gray-700 hover:bg-gold-100',
                        !beforeAvailable && 'opacity-40 cursor-not-allowed hover:bg-gold-50',
                      )}
                    >
                      {t('schedule.amenities.before', 'Avant le soin')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlacement('after')}
                      disabled={!afterAvailable}
                      className={cn(
                        'h-10 rounded-full text-sm font-medium transition-colors',
                        placement === 'after' && afterAvailable
                          ? 'bg-gold-500 text-black'
                          : 'bg-gold-50 text-gray-700 hover:bg-gold-100',
                        !afterAvailable && 'opacity-40 cursor-not-allowed hover:bg-gold-50',
                      )}
                    >
                      {t('schedule.amenities.after', 'Après le soin')}
                    </button>
                  </div>
                  {singleAmenityWindow && hasCommonPlacement && (
                    <p className="text-[11px] text-gray-500 font-light mt-2 inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {singleAmenityWindow}
                    </p>
                  )}
                  {!hasCommonPlacement && (
                    <p className="text-[11px] text-red-500 font-light mt-2">
                      {t(
                        'schedule.amenities.noCommonPlacement',
                        "Ces accès ne peuvent pas être placés ensemble sur ce créneau.",
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div
          className="border-t border-gold-100 px-4 pt-4 bg-white/90 backdrop-blur-sm"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}
        >
          {count > 0 && (
            <div className="flex items-center justify-between text-xs text-gray-600 mb-3 font-light">
              <span>
                {count > 1
                  ? t('schedule.addons.selectedCountPlural', '{{count}} soins sélectionnés', {
                      count,
                    })
                  : t('schedule.addons.selectedCount', '{{count}} soin sélectionné', { count })}
              </span>
              {addedDuration > 0 && (
                <span>
                  {t('schedule.addons.extraDuration', '+{{min}} min', { min: addedDuration })}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={handleSkip}
              className="text-gray-500 hover:text-gray-900 font-grotesk"
            >
              {t('schedule.addons.skip', 'Passer')}
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={confirmDisabled}
              className={cn(
                'h-11 px-5 rounded-full font-medium tracking-wide transition-colors shrink-0 font-grotesk',
                !confirmDisabled
                  ? 'bg-gold-500 text-black hover:bg-gold-400'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed',
              )}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
