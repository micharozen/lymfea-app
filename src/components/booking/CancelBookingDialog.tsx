import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { Trans } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import {
  getCancelPaymentSettlement,
  hasCancelPaymentSidePanel,
} from "@/lib/cancelBookingRules";
import {
  amountsFromRefundPercent,
  canApplyClientTierFinancials,
  hoursUntilBooking,
  parseCancellationTiers,
  resolveRefundPercent,
} from "@/lib/cancellationTiers";
import { formatVenueCancellationPolicy } from "@/lib/formatVenueCancellationPolicy";
import { formatPrice } from "@/lib/formatPrice";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export interface CancelBookingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  bookingId: string;
  booking: {
    booking_id: number;
    client_first_name: string;
    client_last_name: string;
    total_price: number;
    hotel_id: string;
    status: string;
    payment_method?: string | null;
    payment_status?: string | null;
    booking_date?: string;
    booking_time?: string;
  };
  userRole: "admin" | "concierge" | "therapist" | "client";
  publicToken?: string;
  bookingUuid?: string;
  paymentPreview?: {
    card_brand?: string | null;
    card_last4?: string | null;
    estimated_price?: number | null;
  };
  /** Set when opened from another Dialog (edit/detail) to avoid a fully black stacked overlay */
  stackedOnDialog?: boolean;
}

interface PaymentInfo {
  card_brand: string | null;
  card_last4: string | null;
  stripe_payment_intent_id: string | null;
  estimated_price: number | null;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatCancelAmount(amount: number): string {
  return formatPrice(roundCurrency(amount), "EUR");
}

/** Parse admin fee input; empty string → no override */
function parseFeeInput(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isNaN(n) ? null : n;
}

function formatTimeUntilAppointment(hoursUntil: number): string {
  const totalMinutes = Math.max(0, Math.floor(hoursUntil * 60 + 1e-9));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}min`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}min`;
  return "0min";
}

interface HotelFeeConfig {
  cancellation_policy_text_fr: string | null;
  cancellation_policy_text_en: string | null;
  client_cancellation_cutoff_hours: number | null;
  cancellation_tiers: unknown;
  timezone: string | null;
}

const schema = z.object({
  reason: z.string().max(500).optional(),
  send_notification: z.boolean().default(true),
  custom_fee_unit: z.enum(["amount", "percent"]).default("amount"),
});

type FormValues = z.infer<typeof schema>;

export function CancelBookingDialog({
  isOpen,
  onClose,
  onSuccess,
  bookingId,
  booking,
  userRole,
  publicToken,
  bookingUuid,
  paymentPreview,
  stackedOnDialog = false,
}: CancelBookingDialogProps) {
  const { i18n } = useTranslation();
  const resolvedBookingId = bookingUuid ?? bookingId;
  const [showPolicyText, setShowPolicyText] = useState(false);
  const [applyTierSuggestion, setApplyTierSuggestion] = useState(true);
  const [feeInputText, setFeeInputText] = useState("");
  const didInitTierFeeRef = useRef(false);

  const dialogLng = useMemo(() => {
    const lang = i18n.resolvedLanguage || i18n.language || "fr";
    return lang.startsWith("en") ? "en" : "fr";
  }, [i18n.language, i18n.resolvedLanguage]);
  const { t } = useTranslation("common", { lng: dialogLng });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      reason: "",
      send_notification: true,
      custom_fee_unit: "amount",
    },
  });

  const customFeeUnit = form.watch("custom_fee_unit");
  const parsedCustomFee = useMemo(() => parseFeeInput(feeInputText), [feeInputText]);

  const isPartnerBilled = booking.payment_method === "partner_billed";
  const isChargedToRoom = booking.payment_status === "charged_to_room";

  const { data: paymentInfoFromDb } = useQuery<PaymentInfo | null>({
    queryKey: ["payment-info-cancel", resolvedBookingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("booking_payment_infos")
        .select("card_brand, card_last4, stripe_payment_intent_id, estimated_price")
        .eq("booking_id", resolvedBookingId)
        .maybeSingle();
      return data ?? null;
    },
    enabled: isOpen && !paymentPreview,
    staleTime: 30_000,
  });

  const paymentInfo = useMemo<PaymentInfo | null>(() => {
    if (paymentPreview) {
      return {
        card_brand: paymentPreview.card_brand ?? null,
        card_last4: paymentPreview.card_last4 ?? null,
        stripe_payment_intent_id: null,
        estimated_price: paymentPreview.estimated_price ?? null,
      };
    }
    return paymentInfoFromDb ?? null;
  }, [paymentPreview, paymentInfoFromDb]);

  const hasCardDeposit =
    !!paymentInfo?.card_last4 && Number(paymentInfo.estimated_price) > 0;

  const paymentSettlement = useMemo(
    () =>
      getCancelPaymentSettlement(booking.payment_status, booking.payment_method, {
        stripePaymentIntentId: paymentInfo?.stripe_payment_intent_id,
        hasCardDeposit,
      }),
    [
      booking.payment_status,
      booking.payment_method,
      paymentInfo?.stripe_payment_intent_id,
      hasCardDeposit,
    ],
  );

  const needsRefund = paymentSettlement === "refund";
  const releaseCardHold = paymentSettlement === "release_hold";
  const hasPaymentIntentHold = releaseCardHold && !!paymentInfo?.stripe_payment_intent_id;
  const showPaymentSidePanel = hasCancelPaymentSidePanel(
    booking.payment_status,
    booking.payment_method,
    {
      stripePaymentIntentId: paymentInfo?.stripe_payment_intent_id,
      hasCardDeposit,
    },
  );

  const isClientFlow = userRole === "client" || !!publicToken;

  const { data: hotelFee } = useQuery<HotelFeeConfig | null>({
    queryKey: ["hotel-cancel-fee", booking.hotel_id, isClientFlow ? "public" : "staff"],
    queryFn: async () => {
      if (isClientFlow) {
        const { data: rows, error } = await supabase.rpc("get_public_hotel_by_id", {
          _hotel_id: booking.hotel_id,
        });
        if (error) throw error;
        const h = Array.isArray(rows) ? rows[0] : rows;
        if (!h) return null;
        return {
          cancellation_policy_text_fr: null,
          cancellation_policy_text_en: null,
          client_cancellation_cutoff_hours: Number(h.client_cancellation_cutoff_hours ?? 2),
          cancellation_tiers: h.cancellation_tiers,
          timezone: (h.timezone as string | null) ?? "UTC",
        };
      }
      const { data, error } = await supabase
        .from("hotels")
        .select(
          "cancellation_policy_text_fr, cancellation_policy_text_en, client_cancellation_cutoff_hours, cancellation_tiers, timezone",
        )
        .eq("id", booking.hotel_id)
        .single();
      if (error) throw error;
      return data ?? null;
    },
    enabled: isOpen,
    staleTime: 60_000,
  });

  const venuePolicyText = useMemo(
    () =>
      formatVenueCancellationPolicy(
        dialogLng,
        hotelFee
          ? {
              fr: hotelFee.cancellation_policy_text_fr,
              en: hotelFee.cancellation_policy_text_en,
            }
          : null,
        {
          cutoffHours: Number(hotelFee?.client_cancellation_cutoff_hours ?? 2),
          tiers: parseCancellationTiers(hotelFee?.cancellation_tiers),
        },
      ),
    [hotelFee, dialogLng],
  );

  const totalPrice = Number(booking.total_price) || 0;
  const depositAmount = roundCurrency(
    paymentInfo?.estimated_price != null
      ? Number(paymentInfo.estimated_price)
      : totalPrice,
  );

  const hoursUntil = useMemo(() => {
    if (!booking.booking_date || !booking.booking_time) return null;
    return hoursUntilBooking(
      booking.booking_date,
      booking.booking_time,
      hotelFee?.timezone ?? "UTC",
    );
  }, [booking.booking_date, booking.booking_time, hotelFee?.timezone]);

  const tierResult = useMemo(() => {
    if (hoursUntil == null) return null;
    const cutoffHours = Number(hotelFee?.client_cancellation_cutoff_hours ?? 2);
    return resolveRefundPercent(
      hoursUntil,
      parseCancellationTiers(hotelFee?.cancellation_tiers),
      cutoffHours,
    );
  }, [hoursUntil, hotelFee]);

  const tierRefundPercent =
    tierResult?.status === "ok" ? tierResult.refund_percent : null;
  const tierFeePercent =
    tierRefundPercent != null ? Math.max(0, 100 - tierRefundPercent) : null;

  useEffect(() => {
    if (!isOpen) {
      didInitTierFeeRef.current = false;
      return;
    }
    setShowPolicyText(false);
    setFeeInputText("");
    setApplyTierSuggestion(userRole === "admin");
  }, [isOpen, userRole]);

  // Prefill tier % once when modal opens (not on every unit change)
  useEffect(() => {
    if (
      !isOpen ||
      didInitTierFeeRef.current ||
      userRole !== "admin" ||
      tierFeePercent == null
    ) {
      return;
    }
    didInitTierFeeRef.current = true;
    form.setValue("custom_fee_unit", "percent");
    setFeeInputText(String(tierFeePercent));
  }, [isOpen, userRole, tierFeePercent, form]);

  const clientTierPreview = useMemo(() => {
    if (userRole !== "client" || !booking.booking_date || !booking.booking_time) {
      return null;
    }
    const hoursUntil = hoursUntilBooking(
      booking.booking_date,
      booking.booking_time,
      hotelFee?.timezone ?? "UTC",
    );
    if (hoursUntil === null) return { blocked: true as const };
    const cutoffHours = Number(hotelFee?.client_cancellation_cutoff_hours ?? 2);
    const tierResult = resolveRefundPercent(
      hoursUntil,
      parseCancellationTiers(hotelFee?.cancellation_tiers),
      cutoffHours,
    );
    if (tierResult.status === "blocked") return { blocked: true as const };
    return {
      blocked: false as const,
      ...amountsFromRefundPercent(depositAmount, tierResult.refund_percent),
      refundPercent: tierResult.refund_percent,
    };
  }, [
    userRole,
    booking.booking_date,
    booking.booking_time,
    hotelFee,
    depositAmount,
  ]);

  const adminCustomFee =
    userRole === "admin" && parsedCustomFee != null
      ? customFeeUnit === "percent"
        ? Math.min(
            roundCurrency(depositAmount * (parsedCustomFee / 100)),
            depositAmount,
          )
        : Math.min(roundCurrency(parsedCustomFee), depositAmount)
      : null;

  const clientCanSettleTierFees = canApplyClientTierFinancials(
    needsRefund,
    hasPaymentIntentHold,
    isPartnerBilled || isChargedToRoom,
  );

  const feeAmount = roundCurrency(
    userRole === "client" && clientTierPreview && !clientTierPreview.blocked
      ? clientCanSettleTierFees
        ? clientTierPreview.feeApplied
        : 0
      : adminCustomFee != null
        ? adminCustomFee
        : tierRefundPercent != null
          ? amountsFromRefundPercent(depositAmount, tierRefundPercent).feeApplied
          : 0,
  );

  const refundAmount = roundCurrency(
    userRole === "client" && clientTierPreview && !clientTierPreview.blocked
      ? isChargedToRoom || !clientCanSettleTierFees
        ? 0
        : clientTierPreview.refundAmount
      : adminCustomFee != null
        ? Math.max(0, depositAmount - adminCustomFee)
        : tierRefundPercent != null
          ? amountsFromRefundPercent(depositAmount, tierRefundPercent).refundAmount
          : depositAmount,
  );

  const showClientRefundEstimate =
    userRole === "client" && needsRefund && clientCanSettleTierFees;

  const cardLabel =
    paymentInfo?.card_brand && paymentInfo?.card_last4
      ? `${paymentInfo.card_brand.toUpperCase()} ••••${paymentInfo.card_last4}`
      : null;

  const clientName = `${booking.client_first_name} ${booking.client_last_name}`.trim();

  const cancelMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const { data, error } = await invokeEdgeFunction<{ success?: boolean; error?: string }>(
        "cancel-booking",
        {
          skipAuth: !!publicToken,
          body: publicToken
            ? {
                token: publicToken,
                reason: values.reason || undefined,
              }
            : {
                bookingId,
                reason: values.reason || undefined,
                send_notification: values.send_notification,
                ...(userRole === "admin" && parsedCustomFee != null
                  ? values.custom_fee_unit === "percent"
                    ? { custom_cancellation_fee_percent: parsedCustomFee }
                    : { custom_cancellation_fee_amount: parsedCustomFee }
                  : {}),
              },
        },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success(t("cancelBookingDialog.successToast"));
      onSuccess();
      onClose();
      form.reset();
      setFeeInputText("");
    },
    onError: (err: Error) => {
      toast.error(err.message || t("errors.generic"));
    },
  });

  const policyLinkButton = (
    <button
      type="button"
      className="text-primary underline font-medium hover:no-underline"
      onClick={() => setShowPolicyText((v) => !v)}
    />
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        hideOverlay={stackedOnDialog}
        className={cn(
          "bg-background",
          stackedOnDialog && "z-[60]",
          showPaymentSidePanel ? "max-w-2xl p-0 overflow-hidden" : "max-w-lg p-0 overflow-hidden",
        )}
      >
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-xl font-bold">
            {t("cancelBookingDialog.title")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {needsRefund ? (
              <Trans
                i18nKey="cancelBookingDialog.intro"
                ns="common"
                values={{ clientName }}
                components={{ policyLink: policyLinkButton }}
              />
            ) : releaseCardHold ? (
              <Trans
                i18nKey="cancelBookingDialog.introHold"
                ns="common"
                values={{ clientName }}
                components={{ policyLink: policyLinkButton }}
              />
            ) : (
              <Trans
                i18nKey="cancelBookingDialog.introSimple"
                ns="common"
                values={{ clientName }}
                components={{ policyLink: policyLinkButton }}
              />
            )}
          </p>
          {showPolicyText && venuePolicyText && (
            <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground whitespace-pre-wrap">
              <p className="font-medium text-foreground mb-1">
                {t("cancelBookingDialog.policyTitle")}
              </p>
              {venuePolicyText}
            </div>
          )}
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => cancelMutation.mutate(values))}>
            <div className={showPaymentSidePanel ? "grid md:grid-cols-2 gap-0" : "px-6 pb-6 space-y-5"}>
              <CancelFormFields
                form={form}
                t={t}
                hotelFee={hotelFee}
                showSendNotification={userRole !== "client"}
                userRole={userRole}
                hoursUntil={hoursUntil}
                tierRefundPercent={tierRefundPercent}
                tierFeePercent={tierFeePercent}
                applyTierSuggestion={applyTierSuggestion}
                onApplyTierSuggestionChange={setApplyTierSuggestion}
                feeInputText={feeInputText}
                onFeeInputTextChange={setFeeInputText}
                className={showPaymentSidePanel ? "px-6 pb-6 space-y-5 bg-background" : undefined}
              />

              {needsRefund ? (
                <RefundSummaryPanel
                  t={t}
                  totalPrice={totalPrice}
                  depositAmount={depositAmount}
                  cardLabel={cardLabel}
                  isPartnerBilled={isPartnerBilled}
                  feeAmount={feeAmount}
                  refundAmount={refundAmount}
                  showRefundEstimateDisclaimer={showClientRefundEstimate}
                  isPending={cancelMutation.isPending}
                  onClose={onClose}
                />
              ) : releaseCardHold ? (
                <HoldReleaseSummaryPanel
                  t={t}
                  totalPrice={totalPrice}
                  guaranteeAmount={depositAmount}
                  cardLabel={cardLabel}
                  feeAmount={clientCanSettleTierFees ? feeAmount : 0}
                  isPending={cancelMutation.isPending}
                  onClose={onClose}
                />
              ) : (
                <SimpleSummaryPanel
                  t={t}
                  totalPrice={totalPrice}
                  isPartnerBilled={isPartnerBilled}
                  isChargedToRoom={isChargedToRoom}
                  isPending={cancelMutation.isPending}
                  onClose={onClose}
                />
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function CancelFormFields({
  form,
  t,
  hotelFee,
  showSendNotification,
  userRole,
  hoursUntil,
  tierRefundPercent,
  tierFeePercent,
  applyTierSuggestion,
  onApplyTierSuggestionChange,
  feeInputText,
  onFeeInputTextChange,
  className,
}: {
  form: UseFormReturn<FormValues>;
  t: (key: string) => string;
  hotelFee: HotelFeeConfig | null | undefined;
  showSendNotification: boolean;
  userRole: CancelBookingDialogProps["userRole"];
  hoursUntil: number | null;
  tierRefundPercent: number | null;
  tierFeePercent: number | null;
  applyTierSuggestion: boolean;
  onApplyTierSuggestionChange: (value: boolean) => void;
  feeInputText: string;
  onFeeInputTextChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      {userRole === "admin" && (
        <FormItem>
          <FormLabel className="text-sm font-medium">
            {t("cancelBookingDialog.customFeeLabel")}
          </FormLabel>
          <div className="flex gap-2">
            <FormItem className="flex-1 space-y-0">
              <Input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder={
                  tierFeePercent != null
                    ? String(tierFeePercent)
                    : t("cancelBookingDialog.customFeePlaceholder")
                }
                value={feeInputText}
                onChange={(e) => {
                  onApplyTierSuggestionChange(false);
                  onFeeInputTextChange(e.target.value);
                }}
                onFocus={(e) => e.target.select()}
                onBlur={() => {
                  const parsed = parseFeeInput(feeInputText);
                  if (parsed != null) {
                    onFeeInputTextChange(String(parsed));
                  }
                }}
              />
            </FormItem>
            <FormField
              control={form.control}
              name="custom_fee_unit"
              render={({ field: unitField }) => (
                <FormItem className="space-y-0">
                  <Select
                    value={unitField.value}
                    onValueChange={(value: "amount" | "percent") => {
                      onApplyTierSuggestionChange(false);
                      unitField.onChange(value);
                    }}
                  >
                    <FormControl>
                      <SelectTrigger className="w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="z-[70]">
                      <SelectItem value="amount">€</SelectItem>
                      <SelectItem value="percent">%</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("cancelBookingDialog.customFeeHelp")}
          </p>
        </FormItem>
      )}

      {(tierRefundPercent != null || hoursUntil != null) && (
        <div className="rounded-lg border p-3 space-y-1">
          {hoursUntil != null && (
            <p className="text-xs text-muted-foreground">
              {t("cancelBookingDialog.timeRemainingLabel")}:{" "}
              <span className="font-medium text-foreground">
                {formatTimeUntilAppointment(hoursUntil)}
              </span>
            </p>
          )}
          {tierRefundPercent != null && tierFeePercent != null && (
            <p className="text-xs text-muted-foreground">
              {t("cancelBookingDialog.tierLabel")}:{" "}
              <span className="font-medium text-foreground">
                {t("cancelBookingDialog.refundPercentLabel")} {tierRefundPercent}% ·{" "}
                {t("cancelBookingDialog.feePercentLabel")} {tierFeePercent}%
              </span>
            </p>
          )}
          {userRole === "admin" && tierFeePercent != null && (
            <div className="pt-2">
              <FormItem className="flex items-start gap-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={applyTierSuggestion}
                    onCheckedChange={(checked) => {
                      onApplyTierSuggestionChange(checked === true);
                      if (checked === true && tierFeePercent != null) {
                        form.setValue("custom_fee_unit", "percent");
                        onFeeInputTextChange(String(tierFeePercent));
                      }
                    }}
                  />
                </FormControl>
                <FormLabel className="text-sm font-normal leading-snug cursor-pointer">
                  {t("cancelBookingDialog.applyTierLabel")}{" "}
                  <span className="text-muted-foreground">
                    ({t("cancelBookingDialog.recommended")})
                  </span>{" "}
                  <span className="text-muted-foreground">
                    — {tierFeePercent}%
                  </span>
                </FormLabel>
              </FormItem>
            </div>
          )}
        </div>
      )}

      {showSendNotification && (
        <FormField
          control={form.control}
          name="send_notification"
          render={({ field }) => (
            <FormItem className="flex items-start gap-3 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <div>
                <FormLabel className="text-sm font-normal cursor-pointer">
                  {t("cancelBookingDialog.sendNotificationLabel")}
                </FormLabel>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("cancelBookingDialog.sendNotificationHelp")}
                </p>
              </div>
            </FormItem>
          )}
        />
      )}

      <FormField
        control={form.control}
        name="reason"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-sm font-medium">
              {t("cancelBookingDialog.reasonLabel")}
            </FormLabel>
            <FormControl>
              <Textarea
                {...field}
                placeholder={t("cancelBookingDialog.reasonPlaceholder")}
                rows={3}
                className="resize-none"
              />
            </FormControl>
          </FormItem>
        )}
      />
    </div>
  );
}

function RefundSummaryPanel({
  t,
  totalPrice,
  depositAmount,
  cardLabel,
  isPartnerBilled,
  feeAmount,
  refundAmount,
  showRefundEstimateDisclaimer,
  isPending,
  onClose,
}: {
  t: (key: string) => string;
  totalPrice: number;
  depositAmount: number;
  cardLabel: string | null;
  isPartnerBilled: boolean;
  feeAmount: number;
  refundAmount: number;
  showRefundEstimateDisclaimer?: boolean;
  isPending: boolean;
  onClose: () => void;
}) {
  return (
    <div className="bg-muted/40 border-l px-6 py-6 flex flex-col gap-4">
      <p className="text-sm font-semibold">{t("cancelBookingDialog.detailsTitle")}</p>

      <div className="space-y-3 text-sm flex-1">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("cancelBookingDialog.totalBooking")}</span>
          <span className="font-medium">{formatCancelAmount(totalPrice)}</span>
        </div>

        <div className="flex justify-between">
          <div>
            <span className="text-muted-foreground">{t("cancelBookingDialog.depositPaid")}</span>
            <p className="text-xs text-muted-foreground">
              {cardLabel ?? t("cancelBookingDialog.noCardInfo")}
            </p>
          </div>
          <span className="font-medium">{formatCancelAmount(depositAmount)}</span>
        </div>

        {isPartnerBilled && (
          <p className="text-xs text-muted-foreground">{t("cancelBookingDialog.partnerBilledNote")}</p>
        )}

        {feeAmount > 0 && (
          <div className="flex justify-between text-destructive">
            <span>{t("cancelBookingDialog.cancellationFee")}</span>
            <span className="font-medium">−{formatCancelAmount(feeAmount)}</span>
          </div>
        )}

        {!isPartnerBilled && (
          <>
            <Separator />
            <div className="flex justify-between font-semibold">
              <div>
                <span>{t("cancelBookingDialog.totalRefund")}</span>
                <p className="text-xs font-normal text-muted-foreground">
                  {t("cancelBookingDialog.toPaymentMethod")}
                </p>
                {showRefundEstimateDisclaimer && (
                  <p className="text-xs font-normal text-muted-foreground mt-1">
                    {t("cancelBookingDialog.refundEstimateDisclaimer")}
                  </p>
                )}
              </div>
              <span className="text-lg">{formatCancelAmount(refundAmount)}</span>
            </div>
          </>
        )}
      </div>

      <CancelActions t={t} isPending={isPending} onClose={onClose} />
    </div>
  );
}

function HoldReleaseSummaryPanel({
  t,
  totalPrice,
  guaranteeAmount,
  cardLabel,
  feeAmount,
  isPending,
  onClose,
}: {
  t: (key: string) => string;
  totalPrice: number;
  guaranteeAmount: number;
  cardLabel: string | null;
  feeAmount: number;
  isPending: boolean;
  onClose: () => void;
}) {
  return (
    <div className="bg-muted/40 border-l px-6 py-6 flex flex-col gap-4">
      <p className="text-sm font-semibold">{t("cancelBookingDialog.detailsTitle")}</p>

      <div className="space-y-3 text-sm flex-1">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("cancelBookingDialog.totalBooking")}</span>
          <span className="font-medium">{formatCancelAmount(totalPrice)}</span>
        </div>

        <div>
          <span className="text-muted-foreground">{t("cancelBookingDialog.cardOnFile")}</span>
          <p className="text-xs text-muted-foreground">
            {cardLabel ?? t("cancelBookingDialog.noCardInfo")}
          </p>
        </div>

        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("cancelBookingDialog.guaranteeAmount")}</span>
          <span className="font-medium">{formatCancelAmount(guaranteeAmount)}</span>
        </div>

        {feeAmount > 0 && (
          <div className="flex justify-between text-destructive">
            <span>{t("cancelBookingDialog.cancellationFee")}</span>
            <span className="font-medium">−{formatCancelAmount(feeAmount)}</span>
          </div>
        )}

        <Separator />
        <div>
          <p className="font-semibold">{t("cancelBookingDialog.holdReleaseTitle")}</p>
          <p className="text-xs font-normal text-muted-foreground mt-1">
            {t("cancelBookingDialog.holdReleaseHelp")}
          </p>
        </div>
      </div>

      <CancelActions t={t} isPending={isPending} onClose={onClose} />
    </div>
  );
}

function SimpleSummaryPanel({
  t,
  totalPrice,
  isPartnerBilled,
  isChargedToRoom,
  isPending,
  onClose,
}: {
  t: (key: string) => string;
  totalPrice: number;
  isPartnerBilled: boolean;
  isChargedToRoom: boolean;
  isPending: boolean;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4 pt-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{t("cancelBookingDialog.totalBooking")}</span>
        <span className="font-medium">{formatCancelAmount(totalPrice)}</span>
      </div>

      {isPartnerBilled && (
        <p className="text-xs text-muted-foreground">{t("cancelBookingDialog.partnerBilledNote")}</p>
      )}
      {isChargedToRoom && (
        <p className="text-xs text-muted-foreground">{t("cancelBookingDialog.chargedToRoomNote")}</p>
      )}
      {!isPartnerBilled && !isChargedToRoom && (
        <p className="text-xs text-muted-foreground">{t("cancelBookingDialog.noRefundNote")}</p>
      )}

      <CancelActions t={t} isPending={isPending} onClose={onClose} />
    </div>
  );
}

function CancelActions({
  t,
  isPending,
  onClose,
}: {
  t: (key: string) => string;
  isPending: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <Button type="submit" variant="destructive" className="w-full mt-2" disabled={isPending}>
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t("cancelBookingDialog.confirm")}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onClose} disabled={isPending}>
        {t("cancelBookingDialog.back")}
      </Button>
    </>
  );
}

