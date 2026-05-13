import { useForm } from "react-hook-form";
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
  };
  userRole: "admin" | "concierge" | "therapist";
}

interface PaymentInfo {
  card_brand: string | null;
  card_last4: string | null;
  stripe_payment_intent_id: string | null;
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
}: CancelBookingDialogProps) {
  const { t } = useTranslation("common");

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
  const { data: paymentInfo } = useQuery<PaymentInfo | null>({
    queryKey: ["payment-info-cancel", bookingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("booking_payment_infos")
        .select("card_brand, card_last4, stripe_payment_intent_id")
        .eq("booking_id", bookingId)
        .maybeSingle();
      return data ?? null;
    },
    enabled: isOpen,
    staleTime: 30_000,
  });

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

  // Derived values
  const totalPrice = Number(booking.total_price) || 0;
  const hasFeePolicy =
    userRole === "admin" &&
    hotelFee?.cancellation_fee_type &&
    hotelFee.cancellation_fee_type !== "none" &&
    Number(hotelFee.cancellation_fee_amount) > 0;

  const feeAmount = (() => {
    if (!chargeLateFeeLive || !hasFeePolicy || !hotelFee) return 0;
    if (hotelFee.cancellation_fee_type === "fixed") {
      return Number(hotelFee.cancellation_fee_amount) || 0;
    }
    if (hotelFee.cancellation_fee_type === "percentage") {
      return Math.round(totalPrice * (Number(hotelFee.cancellation_fee_amount) / 100) * 100) / 100;
    }
    return 0;
  })();

  const refundAmount = Math.max(0, totalPrice - feeAmount);

  const cardLabel = (() => {
    if (!paymentInfo?.card_brand || !paymentInfo?.card_last4) return null;
    return `${paymentInfo.card_brand.toUpperCase()} ••••${paymentInfo.card_last4}`;
  })();

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const { data, error } = await invokeEdgeFunction("cancel-booking", {
        body: {
          bookingId,
          reason: values.reason || undefined,
          charge_late_fee: values.charge_late_fee,
          send_notification: values.send_notification,
        },
      });
      if (error) throw error;
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-xl font-bold">
            {t("cancelBookingDialog.title")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {t("cancelBookingDialog.intro", {
              clientName: `${booking.client_first_name} ${booking.client_last_name}`.trim(),
            })}
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
                    <span className="font-medium">{totalPrice}€</span>
                  </div>

                  {feeAmount > 0 && (
                    <div className="flex justify-between text-destructive">
                      <span>{t("cancelBookingDialog.cancellationFee")}</span>
                      <span className="font-medium">−{feeAmount}€</span>
                    </div>
                  )}

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
    </Dialog>
  );
}
