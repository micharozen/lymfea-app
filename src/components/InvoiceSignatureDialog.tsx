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
import { X, Loader2, Camera } from "lucide-react";
import { formatPrice } from "@/lib/formatPrice";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const [activeTab, setActiveTab] = useState("digital");
  const [photoData, setPhotoData] = useState<string | null>(null);
  const { t } = useTranslation('pwa');

  const handleClear = () => {
    signatureRef.current?.clear();
    setIsEmpty(true);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Compression de l'image pour éviter de saturer la base de données
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800; // Largeur max pour que ce soit lisible mais léger
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;

        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Convertir en Base64 allégé (JPEG à 70% de qualité)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setPhotoData(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = () => {
    if (activeTab === 'digital' && signatureRef.current && !isEmpty) {
      const signatureData = signatureRef.current.toDataURL();
      onConfirm(signatureData);
    } else if (activeTab === 'paper' && photoData) {
      onConfirm(photoData);
    }
  };

  const handleBeginStroke = () => {
    setIsEmpty(false);
  };

  const subtotal = treatments.reduce((sum, t) => sum + t.price, 0);
  const vatAmount = (subtotal * vatRate) / 100;
  const total = subtotal + vatAmount;

  const isConfirmDisabled = (activeTab === 'digital' ? isEmpty : !photoData) || loading;

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
                    {formatPrice(treatment.price, currency === '€' ? 'EUR' : currency === '$' ? 'USD' : currency === '£' ? 'GBP' : 'EUR')}
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
                  {formatPrice(subtotal, currency === '€' ? 'EUR' : currency === '$' ? 'USD' : currency === '£' ? 'GBP' : 'EUR')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">VAT ({vatRate}%)</span>
                <span className="text-sm font-medium text-foreground">
                  {formatPrice(vatAmount, currency === '€' ? 'EUR' : currency === '$' ? 'USD' : currency === '£' ? 'GBP' : 'EUR')}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-base font-semibold text-foreground">Total</span>
                <span className="text-base font-semibold text-foreground">
                  {formatPrice(total, currency === '€' ? 'EUR' : currency === '$' ? 'USD' : currency === '£' ? 'GBP' : 'EUR')}
                </span>
              </div>
            </div>

            {/* Signature Section avec Onglets */}
            <Tabs defaultValue="digital" value={activeTab} onValueChange={setActiveTab} className="mb-4">
              <TabsList className="grid w-full grid-cols-2 mb-4 bg-muted/50 p-1">
                <TabsTrigger value="digital" className="rounded-lg text-xs font-medium">Sur écran</TabsTrigger>
                <TabsTrigger value="paper" className="rounded-lg text-xs font-medium">Photo papier</TabsTrigger>
              </TabsList>

              <TabsContent value="digital" className="space-y-2 mt-0">
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
              </TabsContent>

              <TabsContent value="paper" className="space-y-2 mt-0">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-foreground">Décharge signée</p>
                </div>
                {!photoData ? (
                  <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-border rounded-xl bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Camera className="w-8 h-8 mb-2 text-muted-foreground" />
                      <p className="text-sm font-medium text-foreground">Prendre une photo</p>
                      <p className="text-[10px] text-muted-foreground mt-1 text-center px-4">
                        Photographiez la décharge signée par le client (Format paysage ou portrait)
                      </p>
                    </div>
                    {/* L'attribut capture="environment" force l'ouverture de l'appareil photo arrière sur mobile */}
                    <input 
                      type="file" 
                      accept="image/*" 
                      capture="environment" 
                      className="hidden" 
                      onChange={handlePhotoUpload} 
                    />
                  </label>
                ) : (
                  <div className="relative w-full h-40 border-2 border-border rounded-xl overflow-hidden bg-muted/30 flex items-center justify-center">
                    <img src={photoData} alt="Décharge papier" className="max-w-full max-h-full object-contain" />
                    <button
                      onClick={() => setPhotoData(null)}
                      className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm p-2 rounded-full shadow-sm border border-border"
                    >
                      <X className="w-4 h-4 text-foreground" />
                    </button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Cette photo remplacera la signature digitale
                </p>
              </TabsContent>
            </Tabs>
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 border-t border-border p-4 pb-safe">
            <Button
              onClick={handleConfirm}
              disabled={isConfirmDisabled}
              className="w-full rounded-full h-12"
            >
              {loading ? "Saving..." : "Save"}
              {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};