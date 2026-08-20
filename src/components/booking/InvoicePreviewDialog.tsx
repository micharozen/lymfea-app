import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { downloadInvoicePdf, renderInvoicePdfBase64 } from "@/lib/invoicePdf";

/** Optional "send this invoice to the therapist" action. */
interface SendToTherapistConfig {
  invoiceId: string;
  recipientEmail: string | null;
  onSent?: () => void;
}

interface InvoicePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceHTML: string;
  bookingId: number | null;
  isRoomPayment: boolean;
  title?: string;
  filename?: string;
  /** When provided, shows an "Envoyer au thérapeute" action. */
  sendToTherapist?: SendToTherapistConfig;
}

export function InvoicePreviewDialog({
  open,
  onOpenChange,
  invoiceHTML,
  bookingId,
  isRoomPayment,
  title,
  filename,
  sendToTherapist,
}: InvoicePreviewDialogProps) {
  const { t } = useTranslation(["admin", "common"]);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const computedTitle =
    title ??
    (isRoomPayment
      ? t("admin:invoicePreview.serviceVoucherTitle", { number: bookingId })
      : t("admin:invoicePreview.invoiceTitle", { number: bookingId }));

  const computedFilename =
    filename ??
    (isRoomPayment ? `bon-prestation-${bookingId}.pdf` : `invoice-${bookingId}.pdf`);

  const handleDownload = async () => {
    try {
      await downloadInvoicePdf(invoiceHTML, computedFilename);
      onOpenChange(false);
    } catch (error) {
      console.error('Error downloading invoice:', error);
    }
  };

  const handleSend = async () => {
    if (!sendToTherapist) return;
    setSending(true);
    try {
      const pdfBase64 = await renderInvoicePdfBase64(invoiceHTML, computedFilename);
      const { error } = await invokeEdgeFunction("generate-therapist-invoices", {
        body: {
          mode: "send",
          invoice_id: sendToTherapist.invoiceId,
          pdf_base64: pdfBase64,
        },
        logContext: { flow: "send-therapist-invoice", invoiceId: sendToTherapist.invoiceId },
      });
      if (error) throw error;
      toast.success(t("admin:invoicePreview.toasts.sent"));
      sendToTherapist.onSent?.();
      setConfirmSendOpen(false);
      onOpenChange(false);
    } catch (err) {
      console.error("Error sending invoice:", err);
      toast.error(t("admin:invoicePreview.errors.sendFailed"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] sm:max-w-[900px] h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-normal text-base">{computedTitle}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden border rounded-lg bg-white">
          <iframe
            title={computedTitle}
            srcDoc={invoiceHTML}
            sandbox="allow-same-origin"
            className="w-full h-full border-0"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("common:buttons.cancel")}
          </Button>
          {sendToTherapist && (
            <Button
              variant="outline"
              onClick={() => setConfirmSendOpen(true)}
              disabled={sending}
            >
              <Send className="h-4 w-4 mr-2" />
              {t("admin:invoicePreview.sendToTherapist")}
            </Button>
          )}
          <Button onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            {t("admin:invoicePreview.downloadPdf")}
          </Button>
        </DialogFooter>
      </DialogContent>

      {sendToTherapist && (
        <AlertDialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("admin:invoicePreview.confirmSendTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {sendToTherapist.recipientEmail
                  ? t("admin:invoicePreview.confirmSendDescription", { email: sendToTherapist.recipientEmail })
                  : t("admin:invoicePreview.noRecipientEmail")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={sending}>{t("common:buttons.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                disabled={sending || !sendToTherapist.recipientEmail}
              >
                {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t("admin:invoicePreview.send")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Dialog>
  );
}
