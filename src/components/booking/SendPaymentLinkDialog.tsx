import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { PaymentLinkForm, BookingData } from "./PaymentLinkForm";

interface SendPaymentLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: BookingData;
  onSuccess?: () => void;
  /** Montant libre (unités de devise) fixé par un admin, transmis à PaymentLinkForm. */
  amountOverride?: number;
}

export function SendPaymentLinkDialog({
  open,
  onOpenChange,
  booking,
  onSuccess,
  amountOverride,
}: SendPaymentLinkDialogProps) {
  const handleClose = () => {
    onOpenChange(false);
  };

  const handleSuccess = () => {
    onSuccess?.();
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <PaymentLinkForm
          booking={booking}
          onSuccess={handleSuccess}
          onSkip={handleClose}
          amountOverride={amountOverride}
        />
      </DialogContent>
    </Dialog>
  );
}

// Re-export BookingData type for backward compatibility
export type { BookingData };
