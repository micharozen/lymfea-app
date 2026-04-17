import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X, Plus, Loader2 } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useQueries } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/formatPrice';
import { useLocalizedField } from '@/hooks/useLocalizedField';
import { useBasket, getCartKey, type BasketItem } from '@/pages/client/context/CartContext';

interface AddonProposalDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hotelId: string;
  date: string;
  time: string;
  onContinue: () => void;
}

interface AddonRow {
  id: string;
  name: string;
  name_en: string | null;
  description: string | null;
  description_en: string | null;
  category: string;
  duration: number | null;
  price: number | null;
  price_on_request: boolean | null;
  image: string | null;
  currency: string | null;
  sort_order: number | null;
}

interface FeasibleAddon {
  addon: AddonRow;
  parentKey: string;
  parentName: string;
  startTime: string;
}

const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const minutesToTime = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
};

export function AddonProposalDrawer({
  open,
  onOpenChange,
  hotelId,
  date,
  time,
  onContinue,
}: AddonProposalDrawerProps) {
  const { t } = useTranslation('client');
  const localize = useLocalizedField();
  const { items, addItem } = useBasket();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Base (non-addon, non-bundle) items in the cart and their end time
  const baseItems = useMemo(
    () => items.filter((i) => !i.isAddon && !i.isBundle),
    [items]
  );

  const totalBaseDuration = useMemo(
    () => baseItems.reduce((sum, i) => sum + (i.duration || 0) * (i.quantity || 1), 0),
    [baseItems]
  );

  const slotEndTime = useMemo(() => {
    if (!time) return null;
    return minutesToTime(timeToMinutes(time) + totalBaseDuration);
  }, [time, totalBaseDuration]);

  // Fetch add-on candidates for each base item (one query per parent id)
  const addonQueries = useQueries({
    queries: baseItems.map((item) => ({
      queryKey: ['treatment-addons', item.id],
      queryFn: async (): Promise<AddonRow[]> => {
        const { data, error } = await supabase.rpc('get_public_treatment_addons', {
          _parent_id: item.id,
        });
        // eslint-disable-next-line no-console
        console.log('[AddonDrawer] RPC get_public_treatment_addons', {
          parentId: item.id,
          parentName: item.name,
          error,
          rowCount: data?.length ?? 0,
          rows: data,
        });
        if (error) throw error;
        return (data ?? []) as AddonRow[];
      },
      enabled: open && !!item.id,
      staleTime: 5 * 60 * 1000,
    })),
  });

  const isLoadingCandidates = addonQueries.some((q) => q.isLoading);

  // Dedup candidates by addon id; pair with first parent it belongs to
  const candidatesByAddon = useMemo(() => {
    const map = new Map<string, { addon: AddonRow; parent: BasketItem }>();
    addonQueries.forEach((q, idx) => {
      const parent = baseItems[idx];
      if (!parent || !q.data) return;
      for (const addon of q.data) {
        if (!map.has(addon.id)) {
          map.set(addon.id, { addon, parent });
        }
      }
    });
    return map;
  }, [addonQueries, baseItems]);

  // Feasibility check: for each candidate, invoke check-availability and verify slotEndTime is in availableSlots
  const [feasibleAddons, setFeasibleAddons] = useState<FeasibleAddon[]>([]);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [hasCheckedFeasibility, setHasCheckedFeasibility] = useState(false);

  // Reset state each time the drawer opens
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set());
      setHasCheckedFeasibility(false);
      setFeasibleAddons([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !slotEndTime || isLoadingCandidates) return;

    // No candidates at all → mark as checked so the auto-skip effect can fire
    if (candidatesByAddon.size === 0) {
      setFeasibleAddons([]);
      setHasCheckedFeasibility(true);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setIsCheckingAvailability(true);
      // eslint-disable-next-line no-console
      console.log('[AddonDrawer] starting feasibility check', {
        slotEndTime,
        candidateCount: candidatesByAddon.size,
        candidates: Array.from(candidatesByAddon.values()).map((v) => ({
          id: v.addon.id,
          name: v.addon.name,
          duration: v.addon.duration,
          category: v.addon.category,
        })),
      });
      try {
        const checks = await Promise.all(
          Array.from(candidatesByAddon.values()).map(async ({ addon, parent }) => {
            try {
              const { data, error } = await supabase.functions.invoke('check-availability', {
                body: {
                  hotelId,
                  date,
                  treatmentIds: [addon.id],
                },
              });
              const slots: string[] = data?.availableSlots || [];
              // slotEndTime (e.g. 12:50) may not align to the slot grid (30min by default).
              // Accept the add-on if ANY slot is >= slotEndTime within 30 minutes tolerance.
              const endMin = timeToMinutes(slotEndTime);
              const slotMinutes = slots
                .map((s) => timeToMinutes(s))
                .sort((a, b) => a - b);
              const earliest = slotMinutes.find((m) => m >= endMin);
              const fits = earliest !== undefined && earliest - endMin <= 30;
              const effectiveStart =
                earliest !== undefined ? minutesToTime(earliest) : slotEndTime;
              // eslint-disable-next-line no-console
              console.log('[AddonDrawer] check-availability for addon', {
                addonId: addon.id,
                addonName: addon.name,
                error,
                slotEndTime,
                slotsReturned: slots.length,
                earliestSlotAfterEnd: earliest !== undefined ? minutesToTime(earliest) : null,
                fits,
              });
              if (error) return null;
              if (!fits) return null;
              return {
                addon,
                parentKey: getCartKey(parent.id, parent.variantId),
                parentName: parent.name,
                startTime: effectiveStart,
              } satisfies FeasibleAddon;
            } catch (e) {
              // eslint-disable-next-line no-console
              console.log('[AddonDrawer] check-availability threw', e);
              return null;
            }
          })
        );
        if (cancelled) return;
        const feasible = checks.filter((x): x is FeasibleAddon => x !== null);
        // eslint-disable-next-line no-console
        console.log('[AddonDrawer] feasibility check done', {
          feasibleCount: feasible.length,
        });
        setFeasibleAddons(feasible);
      } finally {
        if (!cancelled) {
          setIsCheckingAvailability(false);
          setHasCheckedFeasibility(true);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, slotEndTime, isLoadingCandidates, hotelId, date, candidatesByAddon.size]);

  // Auto-skip ONLY after the feasibility check has actually completed and nothing remains to show
  useEffect(() => {
    if (open && hasCheckedFeasibility && !isCheckingAvailability && feasibleAddons.length === 0) {
      onOpenChange(false);
      onContinue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasCheckedFeasibility, isCheckingAvailability, feasibleAddons.length]);

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

  const formatAddonPrice = (addon: AddonRow) => {
    if (addon.price_on_request) return t('payment.onQuote');
    return formatPrice(addon.price ?? 0, addon.currency || 'EUR', { decimals: 0 });
  };

  const isBusy = isLoadingCandidates || isCheckingAvailability;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="lymfea-client max-h-[90dvh] flex flex-col font-grotesk text-gray-900 bg-gradient-to-b from-gold-50 via-white to-white border-t border-gold-200/60">
        <DrawerHeader className="text-left border-b border-gold-100 pb-4 relative bg-gold-50/40">
          <button
            type="button"
            onClick={handleSkip}
            className="absolute top-3 right-4 p-1 rounded-full text-gold-700/60 hover:text-gold-800 hover:bg-gold-100 transition-colors"
            aria-label={t('schedule.addons.skip', 'Passer')}
          >
            <X className="h-5 w-5" />
          </button>
          <DrawerTitle className="font-serif text-xl sm:text-2xl text-gray-900 font-medium leading-tight pr-8">
            {t('schedule.addons.title', 'Ajouter un soin complémentaire ?')}
          </DrawerTitle>
          <DrawerDescription asChild>
            <div className="text-sm text-gray-600 leading-relaxed font-light mt-2">
              {t(
                'schedule.addons.subtitle',
                'Ces soins peuvent s\'enchaîner directement après votre sélection.'
              )}
            </div>
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          {isBusy ? (
            <div className="flex flex-col items-center justify-center py-10 text-sm text-gold-700/70 gap-3">
              <Loader2 className="h-6 w-6 animate-spin" />
              {t('schedule.addons.checking', 'Vérification des disponibilités…')}
            </div>
          ) : feasibleAddons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-sm text-gray-400">
              {t('schedule.addons.none', 'Aucun add-on disponible pour ce créneau.')}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {feasibleAddons.map((entry) => {
                const { addon } = entry;
                const isSelected = selectedIds.has(addon.id);
                return (
                  <button
                    key={addon.id}
                    type="button"
                    onClick={() => toggleSelection(addon.id)}
                    className={cn(
                      'w-full flex items-center justify-between gap-4 p-4 text-left rounded-2xl border transition-all duration-200',
                      isSelected
                        ? 'border-gold-500 bg-gold-50 shadow-[0_4px_14px_rgba(200,160,70,0.15)]'
                        : 'border-gold-100 bg-white hover:border-gold-300 hover:bg-gold-50/40'
                    )}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="font-serif text-base sm:text-lg text-gray-900 font-medium leading-tight">
                        {localize(addon.name, addon.name_en)}
                      </span>
                      <span className="text-xs text-gold-700/70 mt-0.5 font-light">
                        {addon.duration ? `${addon.duration} min · ` : ''}
                        {entry.startTime.slice(0, 5)}
                      </span>
                      <span className="text-sm text-gray-800 mt-1 font-medium">
                        {formatAddonPrice(addon)}
                      </span>
                    </div>

                    <span
                      className={cn(
                        'shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all',
                        isSelected ? 'border-gold-600 bg-gold-600' : 'border-gold-300 bg-white'
                      )}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div
          className="border-t border-gold-100 px-4 pt-4 flex items-center justify-between gap-3 bg-white/80 backdrop-blur-sm"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}
        >
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
            disabled={selectedIds.size === 0 || isBusy}
            className={cn(
              'h-11 px-6 rounded-full font-medium tracking-wide transition-colors shrink-0 font-grotesk',
              selectedIds.size > 0
                ? 'bg-gold-400 text-black hover:bg-gold-200'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            )}
          >
            <Plus className="h-4 w-4 mr-1" />
            {t('schedule.addons.confirm', 'Ajouter')}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
