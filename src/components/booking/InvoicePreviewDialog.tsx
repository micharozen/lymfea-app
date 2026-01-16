import DOMPurify from "dompurify";
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
}

export function InvoicePreviewDialog({
  open,
  onOpenChange,
  invoiceHTML,
  bookingId,
  isRoomPayment,
}: InvoicePreviewDialogProps) {
  const handleDownload = async () => {
    try {
      const html2pdf = (await import('html2pdf.js')).default;

      const element = document.createElement('div');
      element.innerHTML = invoiceHTML;
      document.body.appendChild(element);

      html2pdf()
        .set({
          margin: 0,
          filename: isRoomPayment ? `bon-prestation-${bookingId}.pdf` : `invoice-${bookingId}.pdf`,
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isRoomPayment ? `Bon de Prestation #${bookingId}` : `Aperçu de la facture #${bookingId}`}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto border rounded-lg bg-white">
          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(invoiceHTML) }} />
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
