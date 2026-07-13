import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, RotateCcw, Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EntitySearchCombobox } from "@/components/admin/tasks/EntitySearchCombobox";
import { searchBookings, type BookingSearchResult } from "@/lib/bookingSearch";
import { SendPaymentLinkDialog, type BookingData } from "@/components/booking/SendPaymentLinkDialog";
import { RefundBookingDialog, type RefundBookingTarget } from "./RefundBookingDialog";
import { formatPrice } from "@/lib/formatPrice";
import { toast } from "sonner";

interface QuickActionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type View = "select" | "payment-amount";

async function fetchBookingData(id: string): Promise<BookingData> {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, booking_id, client_first_name, client_last_name, client_email, phone, room_number, booking_date, booking_time, total_price, hotel:hotels(name, currency)",
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  const hotel = (data as { hotel?: { name?: string; currency?: string } | null }).hotel;
  return {
    id: data.id,
    booking_id: data.booking_id ?? 0,
    client_first_name: data.client_first_name ?? "",
    client_last_name: data.client_last_name ?? "",
    client_email: data.client_email ?? undefined,
    phone: data.phone ?? undefined,
    room_number: data.room_number ?? undefined,
    booking_date: data.booking_date,
    booking_time: data.booking_time,
    total_price: data.total_price ?? 0,
    hotel_name: hotel?.name ?? undefined,
    currency: hotel?.currency ?? undefined,
  };
}

export function QuickActionsDialog({ open, onOpenChange }: QuickActionsDialogProps) {
  const [booking, setBooking] = useState<BookingSearchResult | null>(null);
  const [fullBooking, setFullBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>("select");
  const [amount, setAmount] = useState<string>("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);

  const resetAll = () => {
    setBooking(null);
    setFullBooking(null);
    setLoading(false);
    setView("select");
    setAmount("");
    setPaymentOpen(false);
    setRefundOpen(false);
  };

  const handleMainOpenChange = (next: boolean) => {
    if (!next) resetAll();
    onOpenChange(next);
  };

  const handleSelect = async (b: BookingSearchResult | null) => {
    setBooking(b);
    setFullBooking(null);
    setView("select");
    setAmount("");
    if (!b) return;
    setLoading(true);
    try {
      const full = await fetchBookingData(b.id);
      setFullBooking(full);
      setAmount(full.total_price ? String(full.total_price) : "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible de charger la réservation");
      setBooking(null);
    } finally {
      setLoading(false);
    }
  };

  const amountNum = Number.parseFloat(amount);
  const paymentAmountValid = Number.isFinite(amountNum) && amountNum > 0;
  const currency = fullBooking?.currency || "EUR";

  const refundTarget: RefundBookingTarget | null = fullBooking
    ? {
        id: fullBooking.id,
        booking_id: fullBooking.booking_id,
        client_first_name: fullBooking.client_first_name,
        client_last_name: fullBooking.client_last_name,
        total_price: fullBooking.total_price,
        currency: fullBooking.currency,
      }
    : null;

  // Main content is hidden while a sub-flow (payment/refund) is active.
  const mainOpen = open && !paymentOpen && !refundOpen;

  return (
    <>
      <Dialog open={mainOpen} onOpenChange={handleMainOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="sr-only">
            <DialogTitle>Actions paiement</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Réservation</Label>
              <EntitySearchCombobox<BookingSearchResult>
                value={booking}
                onChange={handleSelect}
                search={searchBookings}
                getKey={(b) => b.id}
                getLabel={(b) =>
                  `#${b.booking_id ?? "?"} · ${b.client_first_name ?? ""} ${b.client_last_name ?? ""}`.trim()
                }
                placeholder="Choisir une réservation"
                searchPlaceholder="Rechercher par numéro ou nom…"
                emptyText="Aucune réservation trouvée"
              />
            </div>

            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement de la réservation…
              </div>
            )}

            {fullBooking && !loading && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <p className="font-medium">Réservation #{fullBooking.booking_id}</p>
                <p className="text-muted-foreground">
                  {fullBooking.client_first_name} {fullBooking.client_last_name} ·{" "}
                  {formatPrice(fullBooking.total_price, currency)}
                </p>
              </div>
            )}

            {fullBooking && !loading && view === "select" && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  variant="outline"
                  className="h-auto flex-col items-start gap-1 border-emerald-200 bg-emerald-50 py-3 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                  onClick={() => {
                    setAmount(fullBooking.total_price ? String(fullBooking.total_price) : "");
                    setView("payment-amount");
                  }}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <CreditCard className="h-4 w-4" />
                    Lien de paiement
                  </span>
                  <span className="text-xs opacity-70">Montant libre, envoyé par email/SMS</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto flex-col items-start gap-1 border-red-200 bg-red-50 py-3 text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
                  onClick={() => setRefundOpen(true)}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <RotateCcw className="h-4 w-4" />
                    Rembourser
                  </span>
                  <span className="text-xs opacity-70">Partiel ou total via Stripe</span>
                </Button>
              </div>
            )}

            {fullBooking && !loading && view === "payment-amount" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="payment-amount">Montant du lien</Label>
                  <Input
                    id="payment-amount"
                    type="number"
                    min={0}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Pré-rempli avec le total de la réservation, modifiable.
                  </p>
                </div>
                <div className="flex justify-between gap-2">
                  <Button variant="ghost" onClick={() => setView("select")}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Retour
                  </Button>
                  <Button
                    disabled={!paymentAmountValid}
                    onClick={() => setPaymentOpen(true)}
                  >
                    Continuer
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {fullBooking && (
        <SendPaymentLinkDialog
          open={paymentOpen}
          onOpenChange={(next) => {
            setPaymentOpen(next);
            if (!next) handleMainOpenChange(false);
          }}
          booking={fullBooking}
          amountOverride={paymentAmountValid ? amountNum : undefined}
          onSuccess={() => handleMainOpenChange(false)}
        />
      )}

      {refundTarget && (
        <RefundBookingDialog
          open={refundOpen}
          onOpenChange={(next) => {
            setRefundOpen(next);
            if (!next) handleMainOpenChange(false);
          }}
          booking={refundTarget}
          onSuccess={() => handleMainOpenChange(false)}
        />
      )}
    </>
  );
}
