import { useState } from "react";
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

/** Render `invoiceHTML` to a PDF and return its base64 (without data-URI prefix). */
async function renderInvoicePdfBase64(invoiceHTML: string, filename: string): Promise<string> {
  const html2pdf = (await import("html2pdf.js")).default;
  const element = document.createElement("div");
  element.innerHTML = invoiceHTML;
  document.body.appendChild(element);
  try {
    const dataUri: string = await html2pdf()
      .set({
        margin: 0,
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, letterRendering: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(element)
      .outputPdf("datauristring");
    return dataUri.split(",")[1] ?? "";
  } finally {
    document.body.removeChild(element);
  }
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
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const computedTitle =
    title ??
    (isRoomPayment
      ? `Bon de Prestation #${bookingId}`
      : `Aperçu de la facture #${bookingId}`);

  const computedFilename =
    filename ??
    (isRoomPayment ? `bon-prestation-${bookingId}.pdf` : `invoice-${bookingId}.pdf`);

  const handleDownload = async () => {
    try {
      const html2pdf = (await import('html2pdf.js')).default;

      const element = document.createElement('div');
      element.innerHTML = invoiceHTML;
      document.body.appendChild(element);

      html2pdf()
        .set({
          margin: 0,
          filename: computedFilename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, letterRendering: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        })
        .from(element)
        .save()
        .then(() => {
          document.body.removeChild(element);
          onOpenChange(false);
        });
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
      toast.success("Facture envoyée au thérapeute");
      sendToTherapist.onSent?.();
      setConfirmSendOpen(false);
      onOpenChange(false);
    } catch (err) {
      console.error("Error sending invoice:", err);
      toast.error("Échec de l'envoi de la facture");
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
            Annuler
          </Button>
          {sendToTherapist && (
            <Button
              variant="outline"
              onClick={() => setConfirmSendOpen(true)}
              disabled={sending}
            >
              <Send className="h-4 w-4 mr-2" />
              Envoyer au thérapeute
            </Button>
          )}
          <Button onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Télécharger PDF
          </Button>
        </DialogFooter>
      </DialogContent>

      {sendToTherapist && (
        <AlertDialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Envoyer la facture au thérapeute ?</AlertDialogTitle>
              <AlertDialogDescription>
                {sendToTherapist.recipientEmail
                  ? `La facture sera envoyée en pièce jointe (PDF) à ${sendToTherapist.recipientEmail}.`
                  : "Aucune adresse email n'est renseignée pour ce thérapeute."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={sending}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                disabled={sending || !sendToTherapist.recipientEmail}
              >
                {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Envoyer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Dialog>
  );
}
