import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Mail, Send, CheckCircle2, AlertCircle } from "lucide-react";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { toast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/formatPrice";

interface Treatment {
  name: string;
  price: number;
}

export interface BookingData {
  id: string;
  booking_id: number;
  client_first_name: string;
  client_last_name: string;
  client_email?: string;
  phone?: string;
  room_number?: string;
  booking_date: string;
  booking_time: string;
  total_price: number;
  hotel_name?: string;
  treatments?: Treatment[];
}

interface PaymentLinkFormProps {
  booking: BookingData;
  onSuccess?: () => void;
  onSkip?: () => void;
  showSkipButton?: boolean;
}

export function PaymentLinkForm({
  booking,
  onSuccess,
  onSkip,
  showSkipButton = false,
}: PaymentLinkFormProps) {
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  const [sendEmail, setSendEmail] = useState(true);
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [clientEmail, setClientEmail] = useState(booking.client_email || "");
  const [clientPhone, setClientPhone] = useState(booking.phone || "");
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    emailSent?: boolean;
    whatsappSent?: boolean;
    paymentLinkUrl?: string;
    error?: string;
  } | null>(null);

  const canSend = (sendEmail || sendWhatsApp) &&
    (!sendEmail || clientEmail) &&
    (!sendWhatsApp || clientPhone);

  const handleSend = async () => {
    if (!canSend) return;

    setIsSending(true);
    setResult(null);

    const channels: ("email" | "whatsapp")[] = [];
    if (sendEmail) channels.push("email");
    if (sendWhatsApp) channels.push("whatsapp");

    try {
      const { data, error } = await invokeEdgeFunction<
        { bookingId: string; language: string; channels: string[]; clientEmail?: string; clientPhone?: string },
        { success: boolean; paymentLinkUrl: string; emailSent: boolean; whatsappSent: boolean; errors?: string[] }
      >("send-payment-link", {
        body: {
          bookingId: booking.id,
          language,
          channels,
          clientEmail: sendEmail ? clientEmail : undefined,
          clientPhone: sendWhatsApp ? clientPhone : undefined,
        },
      });

      if (error) {
        setResult({ success: false, error: error.message || "Erreur lors de l'envoi" });
        toast({
          title: "Erreur",
          description: error.message || "Erreur lors de l'envoi du lien de paiement",
          variant: "destructive",
        });
      } else if (data) {
        setResult({
          success: true,
          emailSent: data.emailSent,
          whatsappSent: data.whatsappSent,
          paymentLinkUrl: data.paymentLinkUrl,
        });
        toast({
          title: "Lien envoyé",
          description: "Le lien de paiement a été envoyé avec succès",
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Erreur inconnue";
      setResult({ success: false, error: errorMessage });
      toast({
        title: "Erreur",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  // Format date for preview
  const formattedDate = new Date(booking.booking_date).toLocaleDateString(
    language === "fr" ? "fr-FR" : "en-US",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" }
  );

  // Preview message based on language
  const getPreviewMessage = () => {
    const clientName = `${booking.client_first_name} ${booking.client_last_name}`;
    const treatmentsList = booking.treatments?.map(t => `• ${t.name} - ${formatPrice(t.price)}`).join("\n") || "";

    if (language === "fr") {
      return `Bonjour ${clientName} !

Votre réservation bien-être est confirmée.

Un professionnel viendra directement dans votre chambre ${booking.room_number || "-"} à ${booking.hotel_name || "l'hôtel"}. Vous n'avez rien à faire, juste profiter !

${formattedDate} à ${booking.booking_time}
Réservation #${booking.booking_id}

${treatmentsList}

Total: ${formatPrice(booking.total_price)}

[Lien de paiement sera généré]`;
    }

    return `Hello ${clientName}!

Your wellness booking is confirmed.

A professional will come directly to your room ${booking.room_number || "-"} at ${booking.hotel_name || "the hotel"}. You don't have to do anything, just relax and enjoy!

${formattedDate} at ${booking.booking_time}
Booking #${booking.booking_id}

${treatmentsList}

Total: ${formatPrice(booking.total_price)}

[Payment link will be generated]`;
  };

  if (result?.success) {
    return (
      <div className="py-6 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Lien envoyé avec succès !</h3>
        <div className="text-sm text-muted-foreground space-y-1">
          {result.emailSent && <p>Email envoyé à {clientEmail}</p>}
          {result.whatsappSent && <p>WhatsApp envoyé à {clientPhone}</p>}
        </div>
        {result.paymentLinkUrl && (
          <div className="mt-4 p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Lien de paiement :</p>
            <a
              href={result.paymentLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline break-all"
            >
              {result.paymentLinkUrl}
            </a>
          </div>
        )}
        <Button className="mt-6" onClick={onSuccess}>
          Fermer
        </Button>
      </div>
    );
  }

  if (result?.error) {
    return (
      <div className="py-6 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Erreur lors de l'envoi</h3>
        <p className="text-sm text-muted-foreground">{result.error}</p>
        <div className="flex gap-2 justify-center mt-6">
          <Button variant="outline" onClick={onSkip}>
            Fermer
          </Button>
          <Button onClick={() => setResult(null)}>
            Réessayer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Send className="h-5 w-5" />
        <h3 className="text-lg font-semibold">Envoyer le lien de paiement</h3>
      </div>

      {/* Booking summary */}
      <div className="p-3 bg-muted/50 rounded-lg text-sm">
        <p className="font-medium">Réservation #{booking.booking_id}</p>
        <p className="text-muted-foreground">
          {booking.client_first_name} {booking.client_last_name} - {formatPrice(booking.total_price)}
        </p>
      </div>

      {/* Language selection */}
      <div className="space-y-2">
        <Label>Langue du message</Label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setLanguage("fr")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
              language === "fr"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            <span className="text-lg leading-none">&#x1F1EB;&#x1F1F7;</span>
            Français
          </button>
          <button
            type="button"
            onClick={() => setLanguage("en")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
              language === "en"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            <span className="text-lg leading-none">&#x1F1EC;&#x1F1E7;</span>
            English
          </button>
        </div>
      </div>

      {/* Channel selection */}
      <div className="space-y-3">
        <Label>Envoyer par</Label>

        {/* Email */}
        <div className="p-3 border rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="send-email" className="flex items-center gap-2 cursor-pointer font-medium">
              <Mail className="h-4 w-4 text-blue-500" />
              Email
            </Label>
            <Switch
              id="send-email"
              checked={sendEmail}
              onCheckedChange={setSendEmail}
            />
          </div>
          {sendEmail && (
            <Input
              type="email"
              placeholder="client@email.com"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
            />
          )}
        </div>

        {/* WhatsApp */}
        <div className="p-3 border rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="send-whatsapp" className="flex items-center gap-2 cursor-pointer font-medium">
              <svg className="h-4 w-4 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp
            </Label>
            <Switch
              id="send-whatsapp"
              checked={sendWhatsApp}
              onCheckedChange={setSendWhatsApp}
            />
          </div>
          {sendWhatsApp && (
            <Input
              type="tel"
              placeholder="+33612345678"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
            />
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-2">
        <Label>Aperçu du message</Label>
        <ScrollArea className="h-40 border rounded-lg p-3 bg-muted/30">
          <pre className="text-xs whitespace-pre-wrap font-sans">
            {getPreviewMessage()}
          </pre>
        </ScrollArea>
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        {showSkipButton && (
          <Button variant="outline" onClick={onSkip} disabled={isSending}>
            Passer
          </Button>
        )}
        <Button onClick={handleSend} disabled={!canSend || isSending}>
          {isSending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Envoi en cours...
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Envoyer
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
