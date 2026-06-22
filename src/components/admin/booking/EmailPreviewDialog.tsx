import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEmailHtml } from "@/hooks/booking/useEmailHtml";

interface EmailPreviewDialogProps {
  auditId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmailPreviewDialog({ auditId, open, onOpenChange }: EmailPreviewDialogProps) {
  const { data: html, isLoading, isError } = useEmailHtml(auditId, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] sm:max-w-[700px] h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-normal text-base">Aperçu de l'email</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden border rounded-lg bg-white">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isError || !html ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Aperçu indisponible.
            </div>
          ) : (
            <iframe
              title="Aperçu de l'email"
              srcDoc={html}
              sandbox="allow-same-origin"
              className="w-full h-full border-0"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
