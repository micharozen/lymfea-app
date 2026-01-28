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
}

export function SendPaymentLinkDialog({
  open,
  onOpenChange,
  booking,
  onSuccess,
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
      <DialogContent className="max-w-lg">
        <PaymentLinkForm
          booking={booking}
          onSuccess={handleSuccess}
          onSkip={handleClose}
        />
      </DialogContent>
    </Dialog>
  );
}

// Re-export BookingData type for backward compatibility
export type { BookingData };
