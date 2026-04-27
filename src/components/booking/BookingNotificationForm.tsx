import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Mail, Send, MessageCircle, CheckCircle2, AlertCircle } from "lucide-react";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { toast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/formatPrice";
import type { BookingData } from "./PaymentLinkForm";

interface BookingNotificationFormProps {
  booking: BookingData;
  onSuccess?: () => void;
  onSkip?: () => void;
  hideTitle?: boolean;
}

export function BookingNotificationForm({
  booking,
  onSuccess,
  onSkip,
  hideTitle = false,
}: BookingNotificationFormProps) {
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  const [sendEmail, setSendEmail] = useState(true);
  const [sendSms, setSendSms] = useState(false);
  const [clientEmail, setClientEmail] = useState(booking.client_email || "");
  const [clientPhone, setClientPhone] = useState(booking.phone || "");
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    emailSent?: boolean;
    smsSent?: boolean;
    error?: string;
  } | null>(null);

  const canSend = (sendEmail || sendSms) &&
    (!sendEmail || clientEmail) &&
    (!sendSms || clientPhone);

  const handleSend = async () => {
    if (!canSend) return;

    setIsSending(true);
    setResult(null);

    const channels: ("email" | "sms")[] = [];
    if (sendEmail) channels.push("email");
    if (sendSms) channels.push("sms");

    try {
      const { data, error } = await invokeEdgeFunction<
        { bookingId: string; language: string; channels: string[]; clientEmail?: string; clientPhone?: string },
        { success: boolean; emailSent: boolean; smsSent: boolean; errors?: string[] }
      >("send-booking-notification", {
        body: {
          bookingId: booking.id,
          language,
          channels,
          clientEmail: sendEmail ? clientEmail : undefined,
          clientPhone: sendSms ? clientPhone : undefined,
        },
      });

      if (error) {
        setResult({ success: false, error: error.message || "Erreur lors de l'envoi" });
        toast({
          title: "Erreur",
          description: error.message || "Erreur lors de l'envoi de la notification",
          variant: "destructive",
        });
      } else if (data) {
        setResult({
          success: true,
          emailSent: data.emailSent,
          smsSent: data.smsSent,
        });
        toast({
          title: "Confirmation envoyée",
          description: "La notification de réservation a été envoyée",
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

  const formattedDate = new Date(booking.booking_date).toLocaleDateString(
    language === "fr" ? "fr-FR" : "en-US",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" }
  );

  const getPreviewMessage = () => {
    const clientName = `${booking.client_first_name} ${booking.client_last_name}`;
    const treatmentsList = booking.treatments?.map(t => `• ${t.name} - ${formatPrice(t.price, booking.currency || 'EUR')}`).join("\n") || "";

    if (language === "fr") {
      return `Bonjour ${clientName},

Votre réservation bien-être est confirmée à ${booking.hotel_name || "l'hôtel"}.

${formattedDate} à ${booking.booking_time}
Réservation #${booking.booking_id}${booking.room_number ? `\nChambre ${booking.room_number}` : ""}

${treatmentsList}

Total : ${formatPrice(booking.total_price, booking.currency || 'EUR')}
Le montant sera facturé à l'hôtel, aucune démarche de paiement de votre part.

À très vite !`;
    }

    return `Hello ${clientName},

Your wellness booking at ${booking.hotel_name || "the hotel"} is confirmed.

${formattedDate} at ${booking.booking_time}
Booking #${booking.booking_id}${booking.room_number ? `\nRoom ${booking.room_number}` : ""}

${treatmentsList}

Total: ${formatPrice(booking.total_price, booking.currency || 'EUR')}
The amount will be billed to the hotel, no payment action needed.

See you soon!`;
  };

  if (result?.success) {
    return (
      <div className="py-6 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Notification envoyée !</h3>
        <div className="text-sm text-muted-foreground space-y-1">
          {result.emailSent && <p>Email envoyé à {clientEmail}</p>}
          {result.smsSent && <p>SMS envoyé à {clientPhone}</p>}
        </div>
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
      {!hideTitle && (
        <div className="flex items-center gap-2">
          <Send className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Envoyer la confirmation</h3>
        </div>
      )}

      <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-800">
        Facturation partenaire — aucun lien de paiement ne sera envoyé au client.
      </div>

      <div className="p-3 bg-muted/50 rounded-lg text-sm">
        <p className="font-medium">Réservation #{booking.booking_id}</p>
        <p className="text-muted-foreground">
          {booking.client_first_name} {booking.client_last_name} - {formatPrice(booking.total_price, booking.currency || 'EUR')}
        </p>
      </div>

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

      <div className="space-y-3">
        <Label>Envoyer par</Label>

        <div className="p-3 border rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="notif-email" className="flex items-center gap-2 cursor-pointer font-medium">
              <Mail className="h-4 w-4 text-blue-500" />
              Email
            </Label>
            <Switch
              id="notif-email"
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

        <div className="p-3 border rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="notif-sms" className="flex items-center gap-2 cursor-pointer font-medium">
              <MessageCircle className="h-4 w-4 text-emerald-600" />
              SMS
            </Label>
            <Switch
              id="notif-sms"
              checked={sendSms}
              onCheckedChange={setSendSms}
            />
          </div>
          {sendSms && (
            <Input
              type="tel"
              placeholder="+33612345678"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
            />
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Aperçu du message</Label>
        <ScrollArea className="h-40 border rounded-lg p-3 bg-muted/30">
          <pre className="text-xs whitespace-pre-wrap font-sans">
            {getPreviewMessage()}
          </pre>
        </ScrollArea>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onSkip} disabled={isSending}>
          Passer
        </Button>
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
