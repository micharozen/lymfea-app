import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface VenueClientPreviewTabProps {
  hotelId: string;
}

export function VenueClientPreviewTab({ hotelId }: VenueClientPreviewTabProps) {
  const [copied, setCopied] = useState(false);
  const clientUrl = `${window.location.origin}/client/${hotelId}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(clientUrl);
    setCopied(true);
    toast.success("Lien copié !");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Device frame */}
      <div
        className="relative bg-black rounded-[40px] p-3 shadow-2xl"
        style={{ width: 390, height: 700 }}
      >
        {/* Notch */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-black rounded-full z-10" />
        {/* Screen */}
        <div className="w-full h-full rounded-[32px] overflow-hidden bg-background">
          <iframe
            src={clientUrl}
            className="w-full h-full border-0"
            title="Aperçu client"
            loading="lazy"
          />
        </div>
      </div>

      {/* URL bar */}
      <div className="flex items-center gap-2 w-full max-w-md">
        <div className="flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground font-mono">
          {clientUrl}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="flex-shrink-0"
        >
          {copied ? (
            <Check className="h-4 w-4 mr-1.5 text-green-600" />
          ) : (
            <Copy className="h-4 w-4 mr-1.5" />
          )}
          {copied ? "Copié !" : "Copier"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          asChild
          className="flex-shrink-0"
        >
          <a href={clientUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-1.5" />
            Ouvrir
          </a>
        </Button>
      </div>
    </div>
  );
}
