import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Download } from "lucide-react";

interface InvoicePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceHTML: string;
  bookingId: number | null;
  isRoomPayment: boolean;
  title?: string;
  filename?: string;
}

export function InvoicePreviewDialog({
  open,
  onOpenChange,
  invoiceHTML,
  bookingId,
  isRoomPayment,
  title,
  filename,
}: InvoicePreviewDialogProps) {
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
          <Button onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Télécharger PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
