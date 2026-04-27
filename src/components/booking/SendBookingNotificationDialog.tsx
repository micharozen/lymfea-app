import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <DialogContent className="sm:max-w-md p-0 gap-0 flex flex-col max-h-[90vh]">
        {/* Header fixe — le X reste toujours visible même si le contenu défile */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <DialogTitle className="text-base font-semibold">Envoyer la confirmation</DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 -mr-1 shrink-0">
              <X className="h-4 w-4" />
            </Button>
          </DialogClose>
        </div>
        {/* Corps scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <BookingNotificationForm
            booking={booking}
            onSuccess={handleSuccess}
            onSkip={handleClose}
            hideTitle
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
