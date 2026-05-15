import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
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

// ─── Types ────────────────────────────────────────────────────────────────────

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
  };
  userRole: "admin" | "concierge" | "therapist" | "client";
  /** Public manage-booking token — uses skipAuth + token instead of bookingId. */
  publicToken?: string;
  /** Booking UUID for payment-info query when publicToken is set. */
  bookingUuid?: string;
  /** Preloaded payment preview (e.g. from get_public_booking RPC). */
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
}

// ─── Form schema ─────────────────────────────────────────────────────────────

const schema = z.object({
  reason: z.string().optional(),
  charge_late_fee: z.boolean().default(false),
  send_notification: z.boolean().default(true),
});

type FormValues = z.infer<typeof schema>;

// ─── Component ───────────────────────────────────────────────────────────────

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
  const { t: tClient } = useTranslation("client", { lng: dialogLng });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      reason: "",
      charge_late_fee: false,
      send_notification: true,
    },
  });

  const chargeLateFeeLive = form.watch("charge_late_fee");

  // Fetch payment info (card details + PI existence)
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

  // Fetch venue cancellation policy
  const { data: hotelFee } = useQuery<HotelFeeConfig | null>({
    queryKey: ["hotel-cancel-fee", booking.hotel_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("hotels")
        .select("cancellation_fee_amount, cancellation_fee_type")
        .eq("id", booking.hotel_id)
        .single();
      return data ?? null;
    },
    enabled: isOpen,
    staleTime: 60_000,
  });

  const totalPrice = Number(booking.total_price) || 0;
  const isPartnerBilled = booking.payment_method === "partner_billed";
  const depositAmount =
    paymentInfo?.estimated_price != null
      ? Number(paymentInfo.estimated_price)
      : totalPrice;

  const hasFeePolicy =
    !isPartnerBilled &&
    userRole === "admin" &&
    hotelFee?.cancellation_fee_type &&
    hotelFee.cancellation_fee_type !== "none" &&
    Number(hotelFee.cancellation_fee_amount) > 0;

  const rawFeeAmount = (() => {
    if (!chargeLateFeeLive || !hasFeePolicy || !hotelFee) return 0;
    if (hotelFee.cancellation_fee_type === "fixed") {
      return Number(hotelFee.cancellation_fee_amount) || 0;
    }
    if (hotelFee.cancellation_fee_type === "percentage") {
      return Math.round(totalPrice * (Number(hotelFee.cancellation_fee_amount) / 100) * 100) / 100;
    }
    return 0;
  })();

  const feeAmount = isPartnerBilled ? 0 : Math.min(rawFeeAmount, depositAmount);
  const refundAmount = isPartnerBilled ? 0 : Math.max(0, depositAmount - feeAmount);

  const cardLabel = (() => {
    if (!paymentInfo?.card_brand || !paymentInfo?.card_last4) return null;
    return `${paymentInfo.card_brand.toUpperCase()} ••••${paymentInfo.card_last4}`;
  })();

  // Cancel mutation
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
                send_notification: values.send_notification,
              }
            : {
                bookingId,
                reason: values.reason || undefined,
                charge_late_fee: values.charge_late_fee,
                send_notification: values.send_notification,
              },
        },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success(t("cancelBookingDialog.successToast", "Réservation annulée"));
      onSuccess();
      onClose();
      form.reset();
    },
    onError: (err: Error) => {
      toast.error(err.message || t("errors.generic"));
    },
  });

  const onSubmit = (values: FormValues) => cancelMutation.mutate(values);

  return (
    <Dialog key={dialogLng} open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-xl font-bold">
            {t("cancelBookingDialog.title")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            <Trans
              i18nKey="cancelBookingDialog.intro"
              ns="common"
              values={{
                clientName: `${booking.client_first_name} ${booking.client_last_name}`.trim(),
              }}
              components={{
                policyLink: (
                  <button
                    type="button"
                    className="text-primary underline font-medium hover:no-underline"
                    onClick={() => setShowPolicyDialog(true)}
                  />
                ),
              }}
            />
          </p>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid md:grid-cols-2 gap-0">
              {/* ── Left panel ── */}
              <div className="px-6 pb-6 space-y-5">
                {/* Late fee checkbox (admin + venue policy only) */}
                {hasFeePolicy && (
                  <FormField
                    control={form.control}
                    name="charge_late_fee"
                    render={({ field }) => (
                      <FormItem className="flex items-start gap-3 space-y-0 pt-2">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
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

                {/* Send notification checkbox */}
                <FormField
                  control={form.control}
                  name="send_notification"
                  render={({ field }) => (
                    <FormItem className="flex items-start gap-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
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

                {/* Reason field */}
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

              {/* ── Right panel — details card ── */}
              <div className="bg-muted/40 border-l px-6 py-6 flex flex-col gap-4">
                <p className="text-sm font-semibold">
                  {t("cancelBookingDialog.detailsTitle")}
                </p>

                <div className="space-y-3 text-sm flex-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t("cancelBookingDialog.totalBooking")}
                    </span>
                    <span className="font-medium">{totalPrice}€</span>
                  </div>

                  <div className="flex justify-between">
                    <div>
                      <span className="text-muted-foreground">
                        {t("cancelBookingDialog.depositPaid")}
                      </span>
                      {cardLabel && (
                        <p className="text-xs text-muted-foreground">{cardLabel}</p>
                      )}
                      {!cardLabel && (
                        <p className="text-xs text-muted-foreground">
                          {t("cancelBookingDialog.noCardInfo")}
                        </p>
                      )}
                    </div>
                    <span className="font-medium">{depositAmount}€</span>
                  </div>

                  {isPartnerBilled && (
                    <p className="text-xs text-muted-foreground">
                      {t("cancelBookingDialog.partnerBilledNote")}
                    </p>
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

                <Button
                  type="submit"
                  variant="destructive"
                  className="w-full mt-2"
                  disabled={cancelMutation.isPending}
                >
                  {cancelMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t("cancelBookingDialog.confirm")}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={onClose}
                  disabled={cancelMutation.isPending}
                >
                  {t("cancelBookingDialog.back")}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>

      <AlertDialog open={showPolicyDialog} onOpenChange={setShowPolicyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tClient("payment.cancellationPolicyTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{tClient("payment.cancellationPolicyText")}</AlertDialogDescription>
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
