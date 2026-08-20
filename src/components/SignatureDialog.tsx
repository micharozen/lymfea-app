import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import SignatureCanvas from "react-signature-canvas";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface SignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (signatureData: string) => void;
  loading?: boolean;
}

export const SignatureDialog = ({
  open,
  onOpenChange,
  onConfirm,
  loading = false,
}: SignatureDialogProps) => {
  const { t } = useTranslation(['admin', 'common']);
  const signatureRef = useRef<SignatureCanvas>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  const handleClear = () => {
    signatureRef.current?.clear();
    setIsEmpty(true);
  };

  const handleConfirm = () => {
    if (signatureRef.current && !isEmpty) {
      const signatureData = signatureRef.current.toDataURL();
      onConfirm(signatureData);
    }
  };

  const handleBeginStroke = () => {
    setIsEmpty(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('admin:editBooking.signatureDialog.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('admin:editBooking.signatureDialog.prompt')}
          </p>

          <div 
            className="border-2 border-border rounded-lg bg-background overflow-hidden touch-none"
            style={{ touchAction: 'none', overscrollBehavior: 'contain' }}
          >
            <SignatureCanvas
              ref={signatureRef}
              canvasProps={{
                className: "w-full h-48",
                style: { touchAction: 'none' }
              }}
              backgroundColor="white"
              onBegin={handleBeginStroke}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleClear}
            disabled={isEmpty || loading}
          >
            {t('common:buttons.clear')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isEmpty || loading}
          >
            {loading ? t('admin:editBooking.signatureDialog.validating') : t('common:buttons.validate')}
            {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
