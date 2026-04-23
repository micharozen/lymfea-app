import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { BookingNotificationForm } from "./BookingNotificationForm";
import type { BookingData } from "./PaymentLinkForm";

interface SendBookingNotificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: BookingData;
  onSuccess?: () => void;
}

export function SendBookingNotificationDialog({
  open,
  onOpenChange,
  booking,
  onSuccess,
}: SendBookingNotificationDialogProps) {
  const handleClose = () => {
    onOpenChange(false);
  };

  const handleSuccess = () => {
    onSuccess?.();
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <BookingNotificationForm
          booking={booking}
          onSuccess={handleSuccess}
          onSkip={handleClose}
        />
      </DialogContent>
    </Dialog>
  );
}
