import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Minus, Loader2, Clock, Ticket, Gift, Search, ChevronDown, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/formatPrice";
import { getAmenityType, getAmenityLabel } from "@/lib/amenityTypes";
import type { VenueAmenity } from "@/hooks/useVenueAmenities";
import { CartItem } from "../CreateBookingDialog.schema";
import { getCartLineDisplayName, getCartLineUnitPrice } from "@/lib/bookingCartLine";
import type { BookingClientType } from "@/lib/clientTypeMeta";

interface Treatment {
  id: string;
  name?: string;
  price?: number | null;
  duration?: number | null;
  price_on_request?: boolean | null;
  service_for?: string | null;
  category?: string | null;
  treatment_variants?: TreatmentVariant[];
  [key: string]: unknown;
}

interface TreatmentVariant {
  id: string;
  label?: string | null;
  price?: number | null;
  duration?: number | null;
  is_default?: boolean;
  guest_count?: number;
}

interface BookingPrestationsStepProps {
  treatments: Treatment[] | undefined;
  selectedHotel: { currency?: string | null } | undefined;
  isAdmin: boolean;
  isConcierge: boolean;
  cart: CartItem[];
  cartDetails: Array<CartItem & { treatment: Treatment | undefined }>;
  addToCart: (id: string, variantId?: string | null) => void;
  incrementCart: (id: string, variantId?: string | null) => void;
  decrementCart: (id: string, variantId?: string | null) => void;
  setLineOverride?: (treatmentId: string, variantId: string | null | undefined, value: number | null) => void;
  getCartQuantity: (treatmentId: string, variantId?: string | null) => number;
  totalPrice: number;
  totalDuration: number;
  hasOnRequestService: boolean;
  finalPrice: number;
  customPrice: string;
  setCustomPrice: (v: string) => void;
  customDuration: string;
  setCustomDuration: (v: string) => void;
  isBookingOutOfHours?: boolean;
  surchargeAmount?: number;
  surchargePercent?: number;
  finalPriceWithSurcharge?: number;
  isPending: boolean;
  onBack: () => void;
  onNext?: () => void;
  // Amenity access
  venueAmenities?: VenueAmenity[];
  selectedAmenityIds?: string[];
  onToggleAmenity?: (amenityId: string, enabled: boolean) => void;
  // Client type + voucher payment
  clientType: BookingClientType;
  payByVoucher: boolean;
  onPayByVoucherChange: (value: boolean) => void;
  voucherReference: string;
  onVoucherReferenceChange: (value: string) => void;
  // admin-combo-duo
  comboDuoEligible?: boolean;
  comboDuoEnabled?: boolean;
  onComboDuoChange?: (enabled: boolean) => void;
  sessionCount?: number;
  variantDuoInCart?: boolean;
  // Offert (gratuit) — réservé admin/concierge
  canOffer: boolean;
  isOffert: boolean;
  onIsOffertChange: (value: boolean) => void;
}

export function BookingPrestationsStep({
  treatments,
  selectedHotel,
  isAdmin,
  isConcierge,
  cart,
  cartDetails,
  addToCart,
  incrementCart,
  decrementCart,
  setLineOverride,
  getCartQuantity,
  totalPrice,
  totalDuration,
  hasOnRequestService,
  finalPrice,
  customPrice,
  setCustomPrice,
  customDuration,
  setCustomDuration,
  isBookingOutOfHours,
  surchargeAmount,
  surchargePercent,
  finalPriceWithSurcharge,
  isPending,
  onBack,
  onNext,
  venueAmenities,
  selectedAmenityIds,
  onToggleAmenity,
  clientType,
  payByVoucher,
  onPayByVoucherChange,
  voucherReference,
  onVoucherReferenceChange,
  comboDuoEligible = false,
  comboDuoEnabled = false,
  onComboDuoChange,
  sessionCount = 0,
  variantDuoInCart = false,
  canOffer,
  isOffert,
  onIsOffertChange,
}: BookingPrestationsStepProps) {
  const { t } = useTranslation('admin');
  const [searchQuery, setSearchQuery] = useState("");
  const [showPriceOverrides, setShowPriceOverrides] = useState(false);
  const [showAmenities, setShowAmenities] = useState(false);
  const voucherSupported = clientType === "hotel" || clientType === "external";
  const overriddenCount = cartDetails.filter((l) => l.priceOverride != null).length;
  const enabledAmenities = (venueAmenities ?? []).filter((a) => a.is_enabled);
  const selectedAmenityCount = enabledAmenities.filter((a) => selectedAmenityIds?.includes(a.id)).length;

  return (
    <>
      {/* Treatment search */}
      <div className="relative shrink-0 mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('bookings.searchTreatment', { defaultValue: 'Rechercher un soin…' })}
          className="h-8 pl-8 text-xs"
        />
      </div>

      {/* SERVICE LIST - Scrollable with max height */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {(() => {
          const q = searchQuery.trim().toLowerCase();
          const filtered = (treatments || []).filter(t =>
            !q ||
            (t.name?.toLowerCase().includes(q) ?? false) ||
            (t.category?.toLowerCase().includes(q) ?? false)
          );

          const grouped: Record<string, typeof filtered> = {};
          filtered.forEach(t => {
            const c = t.category || "Autres";
            if (!grouped[c]) grouped[c] = [];
            grouped[c].push(t);
          });

          if (!filtered.length) {
            return (
              <div className="h-16 flex items-center justify-center text-xs text-muted-foreground">
                Aucune prestation disponible
              </div>
            );
          }

          return Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="mb-2">
              <h3 className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1 pb-0.5 border-b border-border/30">
                {category}
              </h3>

              <div>
                {items.map((treatment) => {
                  const totalQty = getCartQuantity(treatment.id);
                  const variants = treatment.treatment_variants ?? [];
                  const hasVariantChoice = variants.length >= 2;

                  if (hasVariantChoice) {
                    return (
                      <div key={treatment.id} className="border-b border-border/10 last:border-0">
                        <div className="flex items-center gap-1.5 py-1.5">
                          <span className="font-medium text-foreground text-xs truncate flex-1">
                            {treatment.name}
                          </span>
                          {treatment.price_on_request && (
                            <span className="shrink-0 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded">
                              Sur demande
                            </span>
                          )}
                          {totalQty > 0 && (
                            <span className="shrink-0 text-[9px] font-bold text-muted-foreground">×{totalQty}</span>
                          )}
                        </div>
                        {variants.map((v, vi) => {
                          const variantQty = getCartQuantity(treatment.id, v.id);
                          const label = v.label || (v.guest_count === 1 ? 'Solo' : v.guest_count === 2 ? 'Duo' : `×${v.guest_count}`);
                          const displayPrice = v.price ?? treatment.price;
                          const displayDuration = v.duration ?? treatment.duration;
                          return (
                            <div key={v.id} className={cn("flex items-center justify-between pl-2 pb-1", vi === variants.length - 1 && "pb-2")}>
                              <div className="flex flex-col flex-1 pr-2 min-w-0">
                                <span className="text-[10px] font-medium text-foreground">{label}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {treatment.price_on_request
                                    ? `${displayDuration} min`
                                    : `${formatPrice(displayPrice, selectedHotel?.currency || 'EUR', { decimals: 0 })} • ${displayDuration} min`}
                                </span>
                              </div>
                              {variantQty > 0 ? (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button type="button" onClick={() => decrementCart(treatment.id, v.id)}
                                    className="w-5 h-5 rounded-full border border-border/50 flex items-center justify-center hover:bg-muted transition-colors">
                                    <Minus className="h-2.5 w-2.5" />
                                  </button>
                                  <span className="text-xs font-bold w-4 text-center">{variantQty}</span>
                                  <button type="button" onClick={() => incrementCart(treatment.id, v.id)}
                                    className="w-5 h-5 rounded-full border border-border/50 flex items-center justify-center hover:bg-muted transition-colors">
                                    <Plus className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              ) : (
                                <button type="button" onClick={() => addToCart(treatment.id, v.id)}
                                  className="shrink-0 bg-foreground text-background text-[9px] font-medium uppercase tracking-wide h-5 px-2.5 rounded-full hover:bg-foreground/80 transition-colors">
                                  Ajouter
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  }

                  const qty = totalQty;
                  const selectedVariant = variants[0] ?? null;
                  const displayPrice = selectedVariant?.price ?? treatment.price;
                  const displayDuration = selectedVariant?.duration ?? treatment.duration;

                  return (
                    <div
                      key={treatment.id}
                      className="border-b border-border/10 last:border-0"
                    >
                      <div className="flex items-center justify-between py-1.5">
                        <div className="flex flex-col flex-1 pr-2 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-foreground text-xs truncate">
                              {treatment.name}
                            </span>
                            {treatment.price_on_request && (
                              <span className="shrink-0 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded">
                                Sur demande
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {treatment.price_on_request
                              ? `${displayDuration} min`
                              : `${formatPrice(displayPrice, selectedHotel?.currency || 'EUR', { decimals: 0 })} • ${displayDuration} min`}
                          </span>
                        </div>

                        {qty > 0 ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => decrementCart(treatment.id)}
                              className="w-5 h-5 rounded-full border border-border/50 flex items-center justify-center hover:bg-muted transition-colors"
                            >
                              <Minus className="h-2.5 w-2.5" />
                            </button>
                            <span className="text-xs font-bold w-4 text-center">{qty}</span>
                            <button
                              type="button"
                              onClick={() => incrementCart(treatment.id)}
                              className="w-5 h-5 rounded-full border border-border/50 flex items-center justify-center hover:bg-muted transition-colors"
                            >
                              <Plus className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addToCart(treatment.id)}
                            className="shrink-0 bg-foreground text-background text-[9px] font-medium uppercase tracking-wide h-5 px-2.5 rounded-full hover:bg-foreground/80 transition-colors"
                          >
                            Ajouter
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ));
        })()}
      </div>

      {/* Compact Footer */}
      <div className="shrink-0 border-t border-border bg-background pt-3 mt-3 space-y-3">
        {/* Admin-only: Custom Price & Duration - ONLY for On Request services */}
        {(isAdmin || isConcierge) && hasOnRequestService && (
          <div className="grid grid-cols-2 gap-2 pb-2 border-b border-border/50">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Prix personnalisé (€)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                className="h-7 text-xs"
                placeholder={String(totalPrice)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Durée personnalisée (min)</Label>
              <Input
                type="number"
                min="0"
                step="5"
                value={customDuration}
                onChange={(e) => setCustomDuration(e.target.value)}
                className="h-7 text-xs"
                placeholder={String(totalDuration)}
              />
            </div>
          </div>
        )}

        {/* Admin-only: per-line price override (special rate). Empty = catalog price.
            Collapsed by default so it doesn't shrink the treatment list. */}
        {(isAdmin || isConcierge) && setLineOverride && cartDetails.length > 0 && (
          <div className="pb-2 border-b border-border/50">
            <button
              type="button"
              onClick={() => setShowPriceOverrides((v) => !v)}
              className="flex w-full items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="h-3 w-3 shrink-0" />
              <span>Prix par prestation</span>
              {overriddenCount > 0 && (
                <span className="text-[8px] uppercase font-semibold text-amber-600 bg-amber-100 rounded px-1 py-0.5 normal-case">
                  {overriddenCount} modifié{overriddenCount > 1 ? 's' : ''}
                </span>
              )}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 ml-auto transition-transform",
                  showPriceOverrides && "rotate-180",
                )}
              />
            </button>
            {showPriceOverrides && (
            <div className="space-y-1.5 mt-2">
            {cartDetails.map(({ treatmentId, variantId, treatment, priceOverride }) => (
              <div key={`ov-${treatmentId}-${variantId ?? 'base'}`} className="flex items-center gap-2">
                <span className="text-[11px] flex-1 truncate">
                  {getCartLineDisplayName(treatment, variantId)}
                </span>
                {priceOverride != null && (
                  <span className="text-[8px] uppercase font-semibold text-amber-600 bg-amber-100 rounded px-1 py-0.5">
                    modifié
                  </span>
                )}
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={priceOverride ?? ''}
                  onChange={(e) =>
                    setLineOverride(
                      treatmentId,
                      variantId,
                      e.target.value === '' ? null : Number(e.target.value),
                    )
                  }
                  className="h-7 w-20 text-xs text-right"
                  placeholder={String(getCartLineUnitPrice(treatment, variantId))}
                />
                <span className="text-[10px] text-muted-foreground">€</span>
              </div>
            ))}
            </div>
            )}
          </div>
        )}

        {/* Out-of-hours surcharge line */}
        {/* Amenity access toggles */}
        {enabledAmenities.length > 0 && onToggleAmenity && (
          <div className="border rounded-md p-2">
            <button
              type="button"
              onClick={() => setShowAmenities((v) => !v)}
              className="flex w-full items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>Accès commodités</span>
              {selectedAmenityCount > 0 && (
                <span className="text-[8px] uppercase font-semibold text-emerald-600 bg-emerald-100 rounded px-1 py-0.5">
                  {selectedAmenityCount} actif{selectedAmenityCount > 1 ? 's' : ''}
                </span>
              )}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 ml-auto transition-transform",
                  showAmenities && "rotate-180",
                )}
              />
            </button>
            {showAmenities && (
            <div className="space-y-1.5 mt-2">
            {enabledAmenities.map((amenity) => {
              const typeDef = getAmenityType(amenity.type);
              const Icon = typeDef?.icon;
              const isSelected = selectedAmenityIds?.includes(amenity.id) ?? false;
              const priceLabel = amenity.lymfea_access_included
                ? "Inclus"
                : formatPrice(Number(amenity.price_lymfea) || 0, amenity.currency || "EUR");

              return (
                <div key={amenity.id} className="flex items-center justify-between gap-2 py-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {Icon && (
                      <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: amenity.color }} />
                    )}
                    <span className="text-xs truncate">
                      {amenity.name || getAmenityLabel(amenity.type, "fr")}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {amenity.lymfea_access_duration || amenity.slot_duration}min
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] text-muted-foreground">{priceLabel}</span>
                    <Switch
                      checked={isSelected}
                      onCheckedChange={(checked) => onToggleAmenity(amenity.id, checked)}
                      className="scale-75"
                    />
                  </div>
                </div>
              );
            })}
            </div>
            )}
          </div>
        )}

        {isBookingOutOfHours && surchargeAmount != null && surchargeAmount > 0 && (
          <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-2.5 py-1.5">
            <span className="flex items-center gap-1.5 text-[10px] text-amber-800 dark:text-amber-300">
              <Clock className="h-3 w-3 shrink-0" />
              Majoration hors horaires ({surchargePercent}%)
            </span>
            <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-300">
              +{formatPrice(surchargeAmount, selectedHotel?.currency || 'EUR')}
            </span>
          </div>
        )}

        {/* Pay-by-voucher block (hotel + external only) */}
        {voucherSupported && (
          <div className="space-y-2 rounded-md border border-border px-2.5 py-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={payByVoucher}
                onCheckedChange={(checked) => onPayByVoucherChange(!!checked)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <Ticket className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {t('bookings.payByVoucher.label')}
                </span>
                {payByVoucher && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {t('bookings.payByVoucher.helper')}
                  </p>
                )}
              </div>
            </label>
            {payByVoucher && (
              <Input
                value={voucherReference}
                onChange={(e) => onVoucherReferenceChange(e.target.value)}
                placeholder={t('bookings.payByVoucher.referenceLabel')}
                className="h-7 text-xs"
              />
            )}
          </div>
        )}

        {/* admin-combo-duo: parallel N solo treatments as one duo booking */}
        {comboDuoEligible && onComboDuoChange && (
          <div className="space-y-1.5 rounded-md border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20 px-2.5 py-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={comboDuoEnabled}
                onCheckedChange={(checked) => onComboDuoChange(!!checked)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium">
                  {t("booking.comboDuo.toggle", {
                    count: sessionCount,
                    defaultValue: `Réserver en duo (${sessionCount} praticiens en parallèle)`,
                  })}
                </span>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {t("booking.comboDuo.helper", {
                    count: sessionCount,
                    defaultValue: "Les soins se déroulent en parallèle, chacun avec son praticien.",
                  })}
                </p>
              </div>
            </label>
          </div>
        )}
        {variantDuoInCart && sessionCount >= 2 && !comboDuoEligible && (
          <p className="text-[10px] text-muted-foreground px-0.5">
            {t("booking.comboDuo.ineligibleVariantDuo", {
              defaultValue: "Réservation duo via variante catalogue — le mode combo n'est pas disponible.",
            })}
          </p>
        )}

        {/* Offert (gratuit) — admin / concierge, tous types de client */}
        {canOffer && (
          <label className="flex items-start gap-2 cursor-pointer rounded-md border border-border px-2.5 py-2">
            <Checkbox
              checked={isOffert}
              onCheckedChange={(checked) => onIsOffertChange(!!checked)}
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <Gift className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {t('bookings.offert.label')}
              </span>
              {isOffert && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  {t('bookings.offert.helper')}
                </p>
              )}
            </div>
          </label>
        )}

        <div className="flex items-center justify-between gap-3">
          {/* Back button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBack}
            className="h-7 text-xs px-2 shrink-0"
          >
            ← Retour
          </Button>

          {/* Cart Summary + Price */}
          <div className="flex-1 min-w-0 flex justify-center">
            {cart.length > 0 ? (
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {cartDetails.slice(0, 3).map(({ treatmentId, variantId, quantity, treatment }) => (
                  <div key={`${treatmentId}-${variantId ?? 'base'}`} className="flex items-center gap-1 bg-muted rounded-full px-2 py-0.5 shrink-0">
                    <span className="text-[9px] font-medium truncate max-w-[60px]">
                      {getCartLineDisplayName(treatment, variantId)}
                    </span>
                    <span className="text-[9px] font-bold">×{quantity}</span>
                  </div>
                ))}
                {cartDetails.length > 3 && (
                  <span className="text-[9px] text-muted-foreground shrink-0">+{cartDetails.length - 3}</span>
                )}
                <span className="font-bold text-sm shrink-0 ml-1">
                  {isOffert
                    ? t('bookings.offert.tag')
                    : formatPrice(finalPriceWithSurcharge ?? finalPrice, selectedHotel?.currency || 'EUR')}
                </span>
              </div>
            ) : (
              <span className="text-[10px] text-muted-foreground">Aucun service</span>
            )}
          </div>

          {/* Staff: go to therapist step — otherwise submit from prestations */}
          {onNext ? (
            <Button
              type="button"
              disabled={cart.length === 0}
              size="sm"
              onClick={onNext}
              className="h-7 text-xs px-3 shrink-0 bg-foreground text-background hover:bg-foreground/90"
            >
              Suivant →
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={isPending || cart.length === 0}
              size="sm"
              className="h-7 text-xs px-3 shrink-0 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {isPending ? "Création..." : "Envoyer la demande"}
              {isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
