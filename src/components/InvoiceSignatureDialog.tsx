import { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { useTranslation } from "react-i18next";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface Treatment {
  name: string;
  duration: number;
  price: number;
}

interface InvoiceSignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (signatureData: string) => void;
  loading?: boolean;
  treatments: Treatment[];
  vatRate?: number;
  currency?: string;
}

export const InvoiceSignatureDialog = ({
  open,
  onOpenChange,
  onConfirm,
  loading = false,
  treatments,
  vatRate = 20,
  currency = "€",
}: InvoiceSignatureDialogProps) => {
  const signatureRef = useRef<SignatureCanvas>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const { t } = useTranslation('pwa');

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

  const subtotal = treatments.reduce((sum, t) => sum + t.price, 0);
  const vatAmount = (subtotal * vatRate) / 100;
  const total = subtotal + vatAmount;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[95vh] max-h-[95vh] overscroll-contain">
        <div className="flex flex-col h-full">
          {/* Header */}
          <DrawerHeader className="flex-shrink-0 border-b border-border px-4 py-3">
            <div className="flex items-center justify-between">
              <button onClick={() => onOpenChange(false)} className="p-1">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
              <DrawerTitle className="text-base font-semibold">Final bill</DrawerTitle>
              <div className="w-6" />
            </div>
          </DrawerHeader>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {/* Treatments List */}
            <div className="space-y-4 mb-6">
              {treatments.map((treatment, index) => (
                <div key={index} className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{treatment.name}</p>
                    <p className="text-xs text-muted-foreground">{treatment.duration} min</p>
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {treatment.price.toFixed(2)}{currency}
                  </p>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="h-px bg-border mb-4" />

            {/* Totals */}
            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Subtotal</span>
                <span className="text-sm font-medium text-foreground">
                  {subtotal.toFixed(2)}{currency}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">VAT ({vatRate}%)</span>
                <span className="text-sm font-medium text-foreground">
                  {vatAmount.toFixed(2)}{currency}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-base font-semibold text-foreground">Total</span>
                <span className="text-base font-semibold text-foreground">
                  {total.toFixed(2)}{currency}
                </span>
              </div>
            </div>

            {/* Signature Section */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-foreground">Client Signature</p>
                <button
                  onClick={handleClear}
                  disabled={isEmpty || loading}
                  className="text-xs text-primary hover:text-primary/80 disabled:opacity-50"
                >
                  Clear
                </button>
              </div>
              <div 
                className="border-2 border-dashed border-border rounded-xl bg-muted/30 overflow-hidden touch-none"
                style={{ touchAction: 'none', overscrollBehavior: 'contain' }}
              >
                <SignatureCanvas
                  ref={signatureRef}
                  canvasProps={{
                    className: "w-full h-40",
                    style: { touchAction: 'none' }
                  }}
                  backgroundColor="transparent"
                  onBegin={handleBeginStroke}
                />
              </div>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Sign above to confirm the services
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 border-t border-border p-4 pb-safe">
            <Button
              onClick={handleConfirm}
              disabled={isEmpty || loading}
              className="w-full rounded-full h-12"
            >
              {loading ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
