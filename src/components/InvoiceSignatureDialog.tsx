import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { X, Loader2, Camera, CheckCircle2, ExternalLink } from "lucide-react";
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
  totalPrice?: number;
  isAlreadyPaid?: boolean;
  signatureToken?: string; // NOUVEAU : Le token pour le lien de signature
}

export const InvoiceSignatureDialog = ({
  open,
  onOpenChange,
  onConfirm,
  loading = false,
  treatments,
  vatRate = 20,
  currency = "€",
  totalPrice,
  isAlreadyPaid = false,
  signatureToken,
}: InvoiceSignatureDialogProps) => {
  const [activeTab, setActiveTab] = useState("digital");
  const [photoData, setPhotoData] = useState<string | null>(null);
  const { t } = useTranslation('pwa');

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800; 
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;

        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setPhotoData(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = () => {
    if (activeTab === 'paper' && photoData) {
      onConfirm(photoData);
    }
  };

  // Calculs intelligents des totaux
  const treatmentsSum = treatments.reduce((sum, t) => sum + t.price, 0);
  const finalTotal = totalPrice !== undefined ? totalPrice : treatmentsSum + ((treatmentsSum * vatRate) / 100);
  const finalSubtotal = finalTotal / (1 + vatRate / 100);
  const finalVatAmount = finalTotal - finalSubtotal;

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
              <DrawerTitle className="text-base font-semibold">Signature Client</DrawerTitle>
              <div className="w-6" />
            </div>
          </DrawerHeader>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            
            {/* Affichage conditionnel de la facture */}
            {isAlreadyPaid ? (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex flex-col items-center justify-center text-center">
                <CheckCircle2 className="w-8 h-8 text-green-500 mb-2" />
                <p className="text-sm font-bold text-green-800">Prestation réglée</p>
                <p className="text-xs text-green-600 mt-1">Veuillez faire signer la décharge de soins au client pour clôturer.</p>
              </div>
            ) : (
              <>
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

                <div className="h-px bg-border mb-4" />

                <div className="space-y-3 mb-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Subtotal</span>
                    <span className="text-sm font-medium text-foreground">
                      {formatPrice(finalSubtotal, currency === '€' ? 'EUR' : currency === '$' ? 'USD' : currency === '£' ? 'GBP' : 'EUR')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">VAT ({vatRate}%)</span>
                    <span className="text-sm font-medium text-foreground">
                      {formatPrice(finalVatAmount, currency === '€' ? 'EUR' : currency === '$' ? 'USD' : currency === '£' ? 'GBP' : 'EUR')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-base font-bold text-foreground">Total</span>
                    <span className="text-base font-bold text-foreground">
                      {formatPrice(finalTotal, currency === '€' ? 'EUR' : currency === '$' ? 'USD' : currency === '£' ? 'GBP' : 'EUR')}
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* Signature Section avec Onglets */}
            <Tabs defaultValue="digital" value={activeTab} onValueChange={setActiveTab} className="mb-4">
              <TabsList className="grid w-full grid-cols-2 mb-4 bg-muted/50 p-1">
                <TabsTrigger value="digital" className="rounded-lg text-xs font-medium">Sur écran</TabsTrigger>
                <TabsTrigger value="paper" className="rounded-lg text-xs font-medium">Photo papier</TabsTrigger>
              </TabsList>

              {/* ONGLET 1 : Lien vers la vraie décharge numérique */}
              <TabsContent value="digital" className="space-y-2 mt-0">
                <div className="flex flex-col items-center justify-center p-6 mt-4 border-2 border-dashed border-border rounded-xl bg-muted/30 text-center">
                  <p className="text-sm font-bold text-foreground mb-2">Décharge légale complète</p>
                  <p className="text-xs text-muted-foreground mb-6">
                    Pour que la signature soit valide, le client doit lire et accepter les conditions générales de la prestation.
                  </p>
                  <Button 
                    onClick={() => {
                      if (signatureToken) {
                        window.open(`/client/signature/${signatureToken}`, '_blank');
                        onOpenChange(false); // On ferme la modale car ça ouvre un nouvel onglet
                      }
                    }} 
                    className="w-full rounded-full flex items-center justify-center gap-2"
                  >
                    Ouvrir le document à signer <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </TabsContent>

              {/* ONGLET 2 : Photo papier */}
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
                        Photographiez la décharge signée par le client
                      </p>
                    </div>
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
              </TabsContent>
            </Tabs>
          </div>

          {/* Footer (Visible uniquement sur l'onglet Photo papier) */}
          {activeTab === 'paper' && (
            <div className="flex-shrink-0 border-t border-border p-4 pb-safe">
              <Button
                onClick={handleConfirm}
                disabled={!photoData || loading}
                className="w-full rounded-full h-12 font-bold"
              >
                {loading ? "Enregistrement..." : "Valider la photo"}
                {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              </Button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};