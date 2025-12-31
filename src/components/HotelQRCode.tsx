import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Download, QrCode as QrCodeIcon, ExternalLink, Copy, Check } from 'lucide-react';
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
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Production domain for public QR codes
  const PRODUCTION_DOMAIN = 'https://oom-clone-genesis.lovable.app';

  const getPublicBaseUrl = () => {
    const { hostname } = window.location;

    // If we're in preview mode (lovableproject.com), use the production domain
    if (hostname.endsWith('.lovableproject.com')) {
      return PRODUCTION_DOMAIN;
    }

    // Otherwise use current origin (already on production or localhost)
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
        width: 280,
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
    link.download = `qr-${hotelName.toLowerCase().replace(/\s+/g, '-')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('QR code téléchargé');
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(bookingUrl);
    setCopied(true);
    toast.success('Lien copié');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenLink = () => {
    window.open(bookingUrl, '_blank');
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-7 w-7 hover:bg-muted"
          title="Voir le QR code"
        >
          <QrCodeIcon className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center">{hotelName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          {/* QR Code */}
          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <canvas ref={canvasRef} />
          </div>

          {/* URL Display */}
          <div className="w-full p-2.5 bg-muted/50 rounded-lg border">
            <p className="text-xs font-mono text-muted-foreground break-all text-center">
              {bookingUrl}
            </p>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-3 gap-2 w-full">
            <Button
              onClick={handleCopyLink}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span className="text-xs">{copied ? 'Copié' : 'Copier'}</span>
            </Button>
            <Button
              onClick={handleOpenLink}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="text-xs">Ouvrir</span>
            </Button>
            <Button
              onClick={handleDownload}
              size="sm"
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="text-xs">PNG</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
