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
import { Loader2, RotateCcw, CheckCircle2, AlertCircle } from "lucide-react";
import { invokeStripe } from "@/lib/supabaseEdgeFunctions";
import { formatPrice } from "@/lib/formatPrice";
import { toast } from "sonner";

export interface RefundBookingTarget {
  id: string;
  booking_id: number;
  client_first_name?: string;
  client_last_name?: string;
  total_price: number;
  currency?: string;
}

interface RefundBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: RefundBookingTarget;
  onSuccess?: () => void;
}

interface RefundResponse {
  success: boolean;
  stripe_refund_id: string | null;
  refund_amount: number;
  is_partial: boolean;
}

export function RefundBookingDialog({
  open,
  onOpenChange,
  booking,
  onSuccess,
}: RefundBookingDialogProps) {
  const currency = booking.currency || "EUR";
  const [amount, setAmount] = useState<string>(String(booking.total_price ?? ""));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<RefundResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amountNum = Number.parseFloat(amount);
  const canSubmit =
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    amountNum <= (booking.total_price ?? Infinity);

  const handleRefund = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const { data, error: invokeError } = await invokeStripe<RefundResponse>("refund", {
        bookingId: booking.id,
        amount: amountNum,
      });
      if (invokeError) {
        setError(invokeError.message || "Erreur lors du remboursement");
        toast.error(invokeError.message || "Erreur lors du remboursement");
      } else if (data) {
        setResult(data);
        toast.success(
          data.is_partial ? "Remboursement partiel effectué" : "Remboursement total effectué",
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Rembourser la réservation
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="py-4 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-500" />
            <p className="font-medium">
              {result.is_partial ? "Remboursement partiel effectué" : "Remboursement total effectué"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatPrice(result.refund_amount, currency)} remboursé{result.is_partial ? " (cumul)" : ""}.
            </p>
            <Button className="mt-6" onClick={() => { onSuccess?.(); handleClose(); }}>
              Fermer
            </Button>
          </div>
        ) : error ? (
          <div className="py-4 text-center">
            <AlertCircle className="mx-auto mb-3 h-12 w-12 text-destructive" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <div className="mt-6 flex justify-center gap-2">
              <Button variant="outline" onClick={handleClose}>Fermer</Button>
              <Button onClick={() => setError(null)}>Réessayer</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="font-medium">Réservation #{booking.booking_id}</p>
              <p className="text-muted-foreground">
                {booking.client_first_name} {booking.client_last_name} · Payé&nbsp;:{" "}
                {formatPrice(booking.total_price, currency)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="refund-amount">Montant à rembourser</Label>
              <Input
                id="refund-amount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Remboursement partiel possible. Le statut passe à « Remboursé » uniquement si le montant total est remboursé.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
                Annuler
              </Button>
              <Button variant="destructive" onClick={handleRefund} disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Remboursement…
                  </>
                ) : (
                  <>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Rembourser {canSubmit ? formatPrice(amountNum, currency) : ""}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
