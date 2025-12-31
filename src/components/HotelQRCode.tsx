import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Download, QrCode as QrCodeIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface HotelQRCodeProps {
  hotelId: string;
  hotelName: string;
}

export function HotelQRCode({ hotelId, hotelName }: HotelQRCodeProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [isOpen, setIsOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const getPublicBaseUrl = () => {
    const { hostname, protocol } = window.location;

    // In Lovable preview domains, all routes are protected. We must point QR codes to the public domain.
    // Example:
    // - Preview:   https://<project>.lovableproject.com
    // - Public:    https://id-preview--<project>.lovable.app
    if (hostname.endsWith('.lovableproject.com')) {
      const projectSubdomain = hostname.replace('.lovableproject.com', '');
      return `${protocol}//id-preview--${projectSubdomain}.lovable.app`;
    }

    return window.location.origin;
  };

  const bookingUrl = `${getPublicBaseUrl()}/client/${hotelId}`;
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure canvas is mounted
      const timer = setTimeout(() => {
        generateQRCode();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, hotelId]);

  const generateQRCode = async () => {
    try {
      if (!canvasRef.current) {
        console.error('Canvas not found');
        return;
      }

      await QRCode.toCanvas(canvasRef.current, bookingUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      // Also generate data URL for download
      const dataUrl = await QRCode.toDataURL(bookingUrl, {
        width: 800,
        margin: 2,
      });
      setQrCodeUrl(dataUrl);
    } catch (error) {
      console.error('Error generating QR code:', error);
      toast.error('Erreur lors de la génération du QR code');
    }
  };

  const handleDownload = () => {
    if (!qrCodeUrl) {
      toast.error('QR code non disponible');
      return;
    }
    const link = document.createElement('a');
    link.href = qrCodeUrl;
    link.download = `${hotelId}-booking-qr.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('QR code téléchargé');
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(bookingUrl);
    toast.success('Lien copié dans le presse-papiers');
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <QrCodeIcon className="h-4 w-4" />
          QR Code
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>QR Code de réservation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-4">{hotelName}</p>
            <div className="flex justify-center mb-4">
              <canvas ref={canvasRef} className="border rounded-lg p-4 bg-white" />
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Scannez ce code pour accéder à la page de réservation
            </p>
          </div>

          <div className="space-y-2">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs font-mono break-all">{bookingUrl}</p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleCopyLink}
                variant="outline"
                className="flex-1"
                size="sm"
              >
                Copier le lien
              </Button>
              <Button
                onClick={handleDownload}
                className="flex-1 gap-2"
                size="sm"
              >
                <Download className="h-4 w-4" />
                Télécharger QR
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
