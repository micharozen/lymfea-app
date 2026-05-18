import { useMemo, useState } from "react";
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
import { computeCancellationAmounts } from "@/lib/cancellationAmounts";
import { formatVenueCancellationPolicy } from "@/lib/formatVenueCancellationPolicy";
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
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  };
  userRole: "admin" | "concierge" | "therapist" | "client";
  publicToken?: string;
  bookingUuid?: string;
  paymentPreview?: {
    card_brand?: string | null;
    card_last4?: string | null;
    estimated_price?: number | null;
  };
}

interface PaymentInfo {
  card_brand: string | null;
  card_last4: string | null;
  stripe_payment_intent_id: string | null;
  estimated_price: number | null;
}

interface HotelFeeConfig {
  cancellation_fee_amount: number | null;
  cancellation_fee_type: "none" | "fixed" | "percentage" | null;
  cancellation_policy_text_fr: string | null;
  cancellation_policy_text_en: string | null;
}

const schema = z.object({
  reason: z.string().max(500).optional(),
  charge_late_fee: z.boolean().default(false),
  send_notification: z.boolean().default(true),
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
}: CancelBookingDialogProps) {
  const { i18n } = useTranslation();
  const resolvedBookingId = bookingUuid ?? bookingId;
  const [showPolicyDialog, setShowPolicyDialog] = useState(false);

  const dialogLng = useMemo(() => {
    const lang = i18n.resolvedLanguage || i18n.language || "fr";
    return lang.startsWith("en") ? "en" : "fr";
  }, [i18n.language, i18n.resolvedLanguage]);
  const { t } = useTranslation("common", { lng: dialogLng });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      reason: "",
      charge_late_fee: false,
      send_notification: true,
    },
  });

  const chargeLateFeeLive = form.watch("charge_late_fee");

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

  const { data: hotelFee } = useQuery<HotelFeeConfig | null>({
    queryKey: ["hotel-cancel-fee", booking.hotel_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("hotels")
        .select(
          "cancellation_fee_amount, cancellation_fee_type, cancellation_policy_text_fr, cancellation_policy_text_en",
        )
        .eq("id", booking.hotel_id)
        .single();
      return data ?? null;
    },
    enabled: isOpen,
    staleTime: 60_000,
  });

  const venuePolicyText = useMemo(
    () =>
      formatVenueCancellationPolicy(
        hotelFee?.cancellation_fee_type,
        hotelFee?.cancellation_fee_amount != null
          ? Number(hotelFee.cancellation_fee_amount)
          : null,
        dialogLng,
        hotelFee
          ? {
              fr: hotelFee.cancellation_policy_text_fr,
              en: hotelFee.cancellation_policy_text_en,
            }
          : null,
      ),
    [hotelFee, dialogLng],
  );

  const totalPrice = Number(booking.total_price) || 0;
  const depositAmount =
    paymentInfo?.estimated_price != null
      ? Number(paymentInfo.estimated_price)
      : totalPrice;

  const canChargeLateFee =
    userRole === "admin" &&
    (needsRefund || hasPaymentIntentHold);

  const hasFeePolicy =
    canChargeLateFee &&
    hotelFee?.cancellation_fee_type &&
    hotelFee.cancellation_fee_type !== "none" &&
    Number(hotelFee.cancellation_fee_amount) > 0;

  const { feeApplied: feeAmount, refundAmount } = computeCancellationAmounts({
    totalPrice,
    depositAmount,
    feeType: hasFeePolicy ? hotelFee?.cancellation_fee_type : "none",
    feeAmount: hotelFee?.cancellation_fee_amount,
    chargeLateFee: chargeLateFeeLive && !!hasFeePolicy,
  });

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
                charge_late_fee: canChargeLateFee ? values.charge_late_fee : false,
                send_notification: values.send_notification,
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
    },
    onError: (err: Error) => {
      toast.error(err.message || t("errors.generic"));
    },
  });

  const policyLinkButton = (
    <button
      type="button"
      className="text-primary underline font-medium hover:no-underline"
      onClick={() => setShowPolicyDialog(true)}
    />
  );

  return (
    <Dialog key={dialogLng} open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={showPaymentSidePanel ? "max-w-2xl p-0 overflow-hidden" : "max-w-lg p-0 overflow-hidden"}>
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
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => cancelMutation.mutate(values))}>
            <div className={showPaymentSidePanel ? "grid md:grid-cols-2 gap-0" : "px-6 pb-6 space-y-5"}>
              <CancelFormFields
                form={form}
                t={t}
                hasFeePolicy={!!hasFeePolicy}
                hotelFee={hotelFee}
                showSendNotification={userRole !== "client"}
                className={showPaymentSidePanel ? "px-6 pb-6 space-y-5" : undefined}
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
                  isPending={cancelMutation.isPending}
                  onClose={onClose}
                />
              ) : releaseCardHold ? (
                <HoldReleaseSummaryPanel
                  t={t}
                  totalPrice={totalPrice}
                  guaranteeAmount={depositAmount}
                  cardLabel={cardLabel}
                  feeAmount={feeAmount}
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

      <AlertDialog open={showPolicyDialog} onOpenChange={setShowPolicyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cancelBookingDialog.policyTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{venuePolicyText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowPolicyDialog(false)}>
              {t("cancelBookingDialog.back")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function CancelFormFields({
  form,
  t,
  hasFeePolicy,
  hotelFee,
  showSendNotification,
  className,
}: {
  form: UseFormReturn<FormValues>;
  t: (key: string) => string;
  hasFeePolicy: boolean;
  hotelFee: HotelFeeConfig | null | undefined;
  showSendNotification: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      {hasFeePolicy && (
        <FormField
          control={form.control}
          name="charge_late_fee"
          render={({ field }) => (
            <FormItem className="flex items-start gap-3 space-y-0 pt-2">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="text-sm font-normal leading-snug cursor-pointer">
                {t("cancelBookingDialog.chargeLateFeesLabel")}
                {hotelFee?.cancellation_fee_type === "percentage" && (
                  <span className="text-muted-foreground ml-1">
                    ({hotelFee.cancellation_fee_amount}%)
                  </span>
                )}
                {hotelFee?.cancellation_fee_type === "fixed" && (
                  <span className="text-muted-foreground ml-1">
                    ({hotelFee.cancellation_fee_amount}€)
                  </span>
                )}
              </FormLabel>
            </FormItem>
          )}
        />
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
  isPending: boolean;
  onClose: () => void;
}) {
  return (
    <div className="bg-muted/40 border-l px-6 py-6 flex flex-col gap-4">
      <p className="text-sm font-semibold">{t("cancelBookingDialog.detailsTitle")}</p>

      <div className="space-y-3 text-sm flex-1">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("cancelBookingDialog.totalBooking")}</span>
          <span className="font-medium">{totalPrice}€</span>
        </div>

        <div className="flex justify-between">
          <div>
            <span className="text-muted-foreground">{t("cancelBookingDialog.depositPaid")}</span>
            <p className="text-xs text-muted-foreground">
              {cardLabel ?? t("cancelBookingDialog.noCardInfo")}
            </p>
          </div>
          <span className="font-medium">{depositAmount}€</span>
        </div>

        {isPartnerBilled && (
          <p className="text-xs text-muted-foreground">{t("cancelBookingDialog.partnerBilledNote")}</p>
        )}

        {feeAmount > 0 && (
          <div className="flex justify-between text-destructive">
            <span>{t("cancelBookingDialog.cancellationFee")}</span>
            <span className="font-medium">−{feeAmount}€</span>
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
              </div>
              <span className="text-lg">{refundAmount}€</span>
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
          <span className="font-medium">{totalPrice}€</span>
        </div>

        <div>
          <span className="text-muted-foreground">{t("cancelBookingDialog.cardOnFile")}</span>
          <p className="text-xs text-muted-foreground">
            {cardLabel ?? t("cancelBookingDialog.noCardInfo")}
          </p>
        </div>

        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("cancelBookingDialog.guaranteeAmount")}</span>
          <span className="font-medium">{guaranteeAmount}€</span>
        </div>

        {feeAmount > 0 && (
          <div className="flex justify-between text-destructive">
            <span>{t("cancelBookingDialog.cancellationFee")}</span>
            <span className="font-medium">−{feeAmount}€</span>
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
        <span className="font-medium">{totalPrice}€</span>
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
