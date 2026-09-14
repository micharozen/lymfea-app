import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { manualPaymentMethodsForVenue, paymentMethodLabel } from "@/lib/paymentMethod";

/** Valeur du select quand l'équipe ne change pas le mode de règlement. */
const UNCHANGED = "__unchanged__";

interface CancelPaymentLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: { id: string; hotel_id: string | null };
  onSuccess?: () => void;
}

/**
 * Désactive le lien de paiement d'une réservation qui n'a plus à être réglée en
 * ligne (carte cadeau, prise en charge hôtel…) et, si l'équipe le précise, pose
 * le nouveau mode de règlement dans la foulée.
 *
 * `partner_billed` n'est pas proposé ici : il exige de choisir le partenaire,
 * ce que fait déjà le dialogue « Marquer comme payé ».
 */
export function CancelPaymentLinkDialog({
  open, onOpenChange, booking, onSuccess,
}: CancelPaymentLinkDialogProps) {
  const { t } = useTranslation(["admin", "common"]);
  const [paymentMethod, setPaymentMethod] = useState<string>(UNCHANGED);
  const [loading, setLoading] = useState(false);

  const methodOptions = [
    { value: UNCHANGED, label: t("bookingDetail.cancelPaymentLink.methodUnchanged") },
    ...manualPaymentMethodsForVenue(booking.hotel_id)
      .filter((method) => method !== "partner_billed")
      .map((method) => ({ value: method, label: paymentMethodLabel(method) })),
  ];

  const handleConfirm = async () => {
    setLoading(true);
    const { error } = await invokeEdgeFunction("cancel-payment-link", {
      body: {
        bookingId: booking.id,
        ...(paymentMethod !== UNCHANGED ? { paymentMethod } : {}),
      },
      logContext: { flow: "cancel-payment-link", bookingId: booking.id },
    });
    setLoading(false);

    if (error) {
      toast.error(t("bookingDetail.cancelPaymentLink.error"));
      return;
    }

    toast.success(t("bookingDetail.cancelPaymentLink.success"));
    setPaymentMethod(UNCHANGED);
    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-normal">
            {t("bookingDetail.cancelPaymentLink.title")}
          </DialogTitle>
          <DialogDescription>
            {t("bookingDetail.cancelPaymentLink.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-sm text-gray-500">
            {t("bookingDetail.cancelPaymentLink.newMethod")}
          </label>
          <SelectField
            options={methodOptions}
            value={paymentMethod}
            onChange={setPaymentMethod}
            searchable={false}
            aria-label={t("bookingDetail.cancelPaymentLink.newMethod")}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:buttons.cancel")}
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("bookingDetail.cancelPaymentLink.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
