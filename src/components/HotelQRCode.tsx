import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { brand } from '@/config/brand';
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

type Lang = 'fr' | 'en';

interface HotelQRCodeProps {
  /** Public URL identifier (slug preferred; UUID accepted as legacy fallback). */
  slug: string;
  hotelName: string;
}

export function HotelQRCode({ slug, hotelName }: HotelQRCodeProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState<Lang | null>(null);
  const [selectedLang, setSelectedLang] = useState<Lang>('fr');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Production domain for public QR codes
  const PRODUCTION_DOMAIN = `https://${brand.appDomain}`;

  const getPublicBaseUrl = () => {
    const { hostname } = window.location;
    if (hostname.endsWith('.lovableproject.com')) {
      return PRODUCTION_DOMAIN;
    }
    return window.location.origin;
  };

  const getBookingUrl = (lang: Lang) =>
    `${getPublicBaseUrl()}/client/${slug}?lang=${lang}`;

  const bookingUrl = getBookingUrl(selectedLang);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        generateQRCode();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, slug, selectedLang]);

  const generateQRCode = async () => {
    try {
      if (!canvasRef.current) return;

      await QRCode.toCanvas(canvasRef.current, bookingUrl, {
        width: 280,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
      });

      const dataUrl = await QRCode.toDataURL(bookingUrl, {
        width: 800,
        margin: 2,
      });
      setQrCodeUrl(dataUrl);
    } catch (error) {
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
    link.download = `qr-${hotelName.toLowerCase().replace(/\s+/g, '-')}-${selectedLang}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('QR code téléchargé');
  };

  const handleCopyLink = async (lang: Lang) => {
    await navigator.clipboard.writeText(getBookingUrl(lang));
    setCopied(lang);
    toast.success('Lien copié');
    setTimeout(() => setCopied(null), 2000);
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
          onClick={(e) => e.stopPropagation()}
        >
          <QrCodeIcon className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="text-center">{hotelName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          {/* Language Toggle */}
          <div className="flex rounded-lg border overflow-hidden">
            {(['fr', 'en'] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setSelectedLang(lang)}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  selectedLang === lang
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                {lang === 'fr' ? '🇫🇷 Français' : '🇬🇧 English'}
              </button>
            ))}
          </div>

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
              onClick={() => handleCopyLink(selectedLang)}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              {copied === selectedLang ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span className="text-xs">{copied === selectedLang ? 'Copié' : 'Copier'}</span>
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
