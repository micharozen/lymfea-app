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
import { useLocalizedField } from '@/hooks/useLocalizedField';
import { useBasket } from '@/pages/client/context/CartContext';
import type { FeasibleAddon } from '@/hooks/client/useFeasibleAddons';

interface AddonProposalDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feasibleAddons: FeasibleAddon[];
  /** Formatted end time of the base slot (e.g. "12:50"). */
  baseEndTime: string;
  onContinue: () => void;
}

export function AddonProposalDrawer({
  open,
  onOpenChange,
  feasibleAddons,
  baseEndTime,
  onContinue,
}: AddonProposalDrawerProps) {
  const { t } = useTranslation('client');
  const localize = useLocalizedField();
  const { addItem } = useBasket();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setSelectedIds(new Set());
  }, [open]);

  const currency = feasibleAddons[0]?.addon.currency || 'EUR';

  const addedTotal = useMemo(
    () =>
      feasibleAddons
        .filter((f) => selectedIds.has(f.addon.id) && !f.addon.price_on_request)
        .reduce((sum, f) => sum + (Number(f.addon.price) || 0), 0),
    [feasibleAddons, selectedIds],
  );

  const addedDuration = useMemo(
    () =>
      feasibleAddons
        .filter((f) => selectedIds.has(f.addon.id))
        .reduce((sum, f) => sum + (f.addon.duration || 0), 0),
    [feasibleAddons, selectedIds],
  );

  const toggleSelection = (addonId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(addonId)) next.delete(addonId);
      else next.add(addonId);
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
    onOpenChange(false);
    onContinue();
  };

  const formatAddonPrice = (addon: FeasibleAddon['addon']) => {
    if (addon.price_on_request) return t('payment.onQuote');
    return formatPrice(addon.price ?? 0, addon.currency || 'EUR', { decimals: 0 });
  };

  const count = selectedIds.size;
  const confirmLabel =
    count === 0
      ? t('schedule.addons.confirmEmpty', 'Choisir un soin')
      : addedTotal > 0
        ? t('schedule.addons.confirmWithTotal', 'Ajouter · +{{total}}', {
            total: formatPrice(addedTotal, currency, { decimals: 0 }),
          })
        : t('schedule.addons.confirm', 'Ajouter');

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
                        {formatAddonPrice(addon)}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
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
              disabled={count === 0}
              className={cn(
                'h-11 px-5 rounded-full font-medium tracking-wide transition-colors shrink-0 font-grotesk',
                count > 0
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
