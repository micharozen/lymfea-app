import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Minus, Loader2, Clock, Ticket, Gift, Search, ChevronDown, ShoppingBag, Trash2 } from "lucide-react";
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
  removeCartLine?: (treatmentId: string, variantId?: string | null) => void;
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
  /** Base soins only — the number of practitioners a combo-duo needs. */
  practitionerCount?: number;
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
  removeCartLine,
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
  practitionerCount = 0,
  variantDuoInCart = false,
  canOffer,
  isOffert,
  onIsOffertChange,
}: BookingPrestationsStepProps) {
  const { t } = useTranslation('admin');
  const [searchQuery, setSearchQuery] = useState("");
  const [showAmenities, setShowAmenities] = useState(false);
  const voucherSupported = clientType === "hotel" || clientType === "external";
  const enabledAmenities = (venueAmenities ?? []).filter((a) => a.is_enabled);
  const selectedAmenityCount = enabledAmenities.filter((a) => selectedAmenityIds?.includes(a.id)).length;
  const currency = selectedHotel?.currency || 'EUR';
  const canOverride = isAdmin || isConcierge;
  const cartCount = cartDetails.reduce((n, x) => n + x.quantity, 0);

  const Stepper = ({ qty, onDec, onInc }: { qty: number; onDec: () => void; onInc: () => void }) => (
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={onDec}
        className="w-6 h-6 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"
      >
        <Minus className="h-3 w-3" />
      </button>
      <span className="text-sm font-semibold w-5 text-center tabular-nums">{qty}</span>
      <button
        type="button"
        onClick={onInc}
        className="w-6 h-6 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );

  const AddButton = ({ onClick }: { onClick: () => void }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="shrink-0 h-7 rounded-full gap-1 px-3 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
    >
      <Plus className="h-3.5 w-3.5" />
      Ajouter
    </Button>
  );

  const OnRequestBadge = () => (
    <span className="shrink-0 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded">
      Sur demande
    </span>
  );

  const priceLine = (treatment: Treatment, price: number | null | undefined, duration: number | null | undefined) =>
    treatment.price_on_request
      ? `${duration} min`
      : `${formatPrice(price, currency, { decimals: 0 })} • ${duration} min`;

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-0">
      {/* ── Colonne gauche : catalogue des soins ── */}
      <div className="flex-1 flex flex-col min-h-0 px-6 pt-3 pb-3 md:border-r border-border">
        <div className="relative shrink-0 mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('bookings.searchTreatment', { defaultValue: 'Rechercher un soin…' })}
            className="h-10 pl-9 text-sm"
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
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
                <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">
                  Aucune prestation disponible
                </div>
              );
            }

            return Object.entries(grouped).map(([category, items]) => (
              <div key={category} className="mb-4 last:mb-0">
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 pb-1 border-b border-border/40">
                  {category}
                </h3>

                <div className="space-y-1">
                  {items.map((treatment) => {
                    const variants = treatment.treatment_variants ?? [];
                    const hasVariantChoice = variants.length >= 2;
                    const totalQty = getCartQuantity(treatment.id);

                    // Treatment with multiple variants → header + one row per variant.
                    if (hasVariantChoice) {
                      return (
                        <div key={treatment.id} className="rounded-lg border border-transparent hover:border-border/60 hover:bg-muted/30 transition-colors px-2 py-1.5">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-normal text-foreground text-sm truncate flex-1">
                              {treatment.name}
                            </span>
                            {treatment.price_on_request && <OnRequestBadge />}
                            {totalQty > 0 && (
                              <span className="shrink-0 text-xs font-bold text-primary">×{totalQty}</span>
                            )}
                          </div>
                          {variants.map((v) => {
                            const variantQty = getCartQuantity(treatment.id, v.id);
                            const label = v.label || (v.guest_count === 1 ? 'Solo' : v.guest_count === 2 ? 'Duo' : `×${v.guest_count}`);
                            return (
                              <div key={v.id} className="flex items-center justify-between gap-2 pl-3 py-1">
                                <div className="flex flex-col flex-1 pr-2 min-w-0">
                                  <span className="text-sm font-medium text-foreground">{label}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {priceLine(treatment, v.price ?? treatment.price, v.duration ?? treatment.duration)}
                                  </span>
                                </div>
                                {variantQty > 0 ? (
                                  <Stepper
                                    qty={variantQty}
                                    onDec={() => decrementCart(treatment.id, v.id)}
                                    onInc={() => incrementCart(treatment.id, v.id)}
                                  />
                                ) : (
                                  <AddButton onClick={() => addToCart(treatment.id, v.id)} />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    }

                    // Treatment with 0-1 variant → single row.
                    const selectedVariant = variants[0] ?? null;
                    return (
                      <div
                        key={treatment.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-transparent hover:border-border/60 hover:bg-muted/30 transition-colors px-2 py-2"
                      >
                        <div className="flex flex-col flex-1 pr-2 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-normal text-foreground text-sm truncate">
                              {treatment.name}
                            </span>
                            {treatment.price_on_request && <OnRequestBadge />}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {priceLine(
                              treatment,
                              selectedVariant?.price ?? treatment.price,
                              selectedVariant?.duration ?? treatment.duration,
                            )}
                          </span>
                        </div>

                        {totalQty > 0 ? (
                          <Stepper
                            qty={totalQty}
                            onDec={() => decrementCart(treatment.id)}
                            onInc={() => incrementCart(treatment.id)}
                          />
                        ) : (
                          <AddButton onClick={() => addToCart(treatment.id)} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ));
          })()}
        </div>
      </div>

      {/* ── Colonne droite : panier ── */}
      <div className="w-full md:w-[300px] shrink-0 flex flex-col min-h-0 bg-muted/30 border-t md:border-t-0 border-border">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Panier</span>
          </div>
          {cartCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {cartCount} soin{cartCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2">
          {cartDetails.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8">
              <ShoppingBag className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm font-medium text-muted-foreground">Votre panier est vide</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">Ajoutez des soins depuis la liste</p>
            </div>
          ) : (
            cartDetails.map(({ treatmentId, variantId, quantity, priceOverride, treatment }) => {
              const unitPrice = getCartLineUnitPrice(treatment, variantId, priceOverride);
              const lineTotal = unitPrice * quantity;
              return (
                <div key={`${treatmentId}-${variantId ?? 'base'}`} className="rounded-lg border border-border bg-background p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-tight truncate">
                        {getCartLineDisplayName(treatment, variantId)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatPrice(unitPrice, currency, { decimals: 0 })} / unité
                      </p>
                    </div>
                    {removeCartLine && (
                      <button
                        type="button"
                        onClick={() => removeCartLine(treatmentId, variantId)}
                        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-0.5"
                        aria-label="Retirer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => decrementCart(treatmentId, variantId)}
                        className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-sm font-semibold w-5 text-center tabular-nums">{quantity}</span>
                      <button
                        type="button"
                        onClick={() => incrementCart(treatmentId, variantId)}
                        className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="text-sm font-bold">{formatPrice(lineTotal, currency, { decimals: 0 })}</span>
                  </div>

                  {canOverride && setLineOverride && (
                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/50">
                      <span className="text-[11px] text-muted-foreground shrink-0">Prix spécial</span>
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
                        className="h-7 flex-1 min-w-0 text-xs text-right"
                        placeholder={String(getCartLineUnitPrice(treatment, variantId))}
                      />
                      <span className="text-[11px] text-muted-foreground shrink-0">€</span>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Admin-only: Custom Price & Duration - ONLY for On Request services */}
          {canOverride && hasOnRequestService && (
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-background p-2.5">
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

          {/* Amenity access toggles */}
          {enabledAmenities.length > 0 && onToggleAmenity && (
            <div className="rounded-lg border border-border bg-background p-2.5">
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
                    const amenityPrice = amenity.lymfea_access_included
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
                          <span className="text-[10px] text-muted-foreground">{amenityPrice}</span>
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

          {/* Out-of-hours surcharge line */}
          {isBookingOutOfHours && surchargeAmount != null && surchargeAmount > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-2.5 py-1.5">
              <span className="flex items-center gap-1.5 text-[10px] text-amber-800 dark:text-amber-300">
                <Clock className="h-3 w-3 shrink-0" />
                Majoration hors horaires ({surchargePercent}%)
              </span>
              <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                +{formatPrice(surchargeAmount, currency)}
              </span>
            </div>
          )}

          {/* Pay-by-voucher block (hotel + external only) */}
          {voucherSupported && (
            <div className="space-y-2 rounded-lg border border-border bg-background px-2.5 py-2">
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
            <div className="space-y-1.5 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20 px-2.5 py-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={comboDuoEnabled}
                  onCheckedChange={(checked) => onComboDuoChange(!!checked)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium">
                    {t("booking.comboDuo.toggle", {
                      count: practitionerCount,
                      defaultValue: `Réserver en duo (${practitionerCount} praticiens en parallèle)`,
                    })}
                  </span>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {t("booking.comboDuo.helper", {
                      count: practitionerCount,
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
            <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-border bg-background px-2.5 py-2">
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
        </div>

        <div className="border-t border-border bg-background px-4 py-3 space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-lg font-bold">
              {isOffert
                ? t('bookings.offert.tag')
                : formatPrice(finalPriceWithSurcharge ?? finalPrice, currency)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onBack}
              className="flex-1 h-9 text-sm"
            >
              ← Retour
            </Button>
            {/* Staff: go to therapist step — otherwise submit from prestations */}
            {onNext ? (
              <Button
                type="button"
                disabled={cart.length === 0}
                size="sm"
                onClick={onNext}
                className="flex-1 h-9 text-sm bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Suivant →
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={isPending || cart.length === 0}
                size="sm"
                className="flex-1 h-9 text-sm bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {isPending ? "Création..." : "Envoyer la demande"}
                {isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
