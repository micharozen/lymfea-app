import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { downloadInvoicePdf } from "@/lib/invoicePdf";

interface ClosureReportPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  html: string;
  filename: string;
  title: string;
}

export function ClosureReportPreviewDialog({
  open,
  onOpenChange,
  html,
  filename,
  title,
}: ClosureReportPreviewDialogProps) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadInvoicePdf(html, filename, { useCors: true });
    } catch (error) {
      console.error("[ClosureReportPreviewDialog] PDF generation failed:", error);
      toast.error("Impossible de générer le PDF");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] sm:max-w-[900px] h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-normal text-base">{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden border rounded-lg bg-white">
          <iframe
            title={title}
            srcDoc={html}
            sandbox="allow-same-origin"
            className="w-full h-full border-0"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
          <Button onClick={handleDownload} disabled={downloading}>
            {downloading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Télécharger PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
