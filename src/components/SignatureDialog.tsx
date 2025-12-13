import { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
          <DialogTitle>Signature du client</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Demandez au client de signer ci-dessous pour valider les prestations
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
            Effacer
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isEmpty || loading}
          >
            {loading ? "Validation..." : "Valider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
