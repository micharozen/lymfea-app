import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Mail, MessageCircle, Send, CheckCircle2, AlertCircle } from "lucide-react";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { toast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/formatPrice";

interface Treatment {
  name: string;
  price: number;
}

interface BookingData {
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

interface SendPaymentLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: BookingData;
  onSuccess?: () => void;
}

export function SendPaymentLinkDialog({
  open,
  onOpenChange,
  booking,
  onSuccess,
}: SendPaymentLinkDialogProps) {
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
        onSuccess?.();
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

  const handleClose = () => {
    setResult(null);
    onOpenChange(false);
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Envoyer le lien de paiement
          </DialogTitle>
        </DialogHeader>

        {result?.success ? (
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
            <Button className="mt-6" onClick={handleClose}>
              Fermer
            </Button>
          </div>
        ) : result?.error ? (
          <div className="py-6 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Erreur lors de l'envoi</h3>
            <p className="text-sm text-muted-foreground">{result.error}</p>
            <div className="flex gap-2 justify-center mt-6">
              <Button variant="outline" onClick={handleClose}>
                Fermer
              </Button>
              <Button onClick={() => setResult(null)}>
                Réessayer
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-6">
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
                <RadioGroup
                  value={language}
                  onValueChange={(v) => setLanguage(v as "fr" | "en")}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="fr" id="lang-fr" />
                    <Label htmlFor="lang-fr" className="cursor-pointer">
                      Français
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="en" id="lang-en" />
                    <Label htmlFor="lang-en" className="cursor-pointer">
                      English
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Channel selection */}
              <div className="space-y-3">
                <Label>Envoyer par</Label>

                {/* Email */}
                <div className="flex items-start gap-3 p-3 border rounded-lg">
                  <Checkbox
                    id="send-email"
                    checked={sendEmail}
                    onCheckedChange={(checked) => setSendEmail(checked === true)}
                  />
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="send-email" className="flex items-center gap-2 cursor-pointer">
                      <Mail className="h-4 w-4" />
                      Email
                    </Label>
                    {sendEmail && (
                      <Input
                        type="email"
                        placeholder="client@email.com"
                        value={clientEmail}
                        onChange={(e) => setClientEmail(e.target.value)}
                      />
                    )}
                  </div>
                </div>

                {/* WhatsApp */}
                <div className="flex items-start gap-3 p-3 border rounded-lg">
                  <Checkbox
                    id="send-whatsapp"
                    checked={sendWhatsApp}
                    onCheckedChange={(checked) => setSendWhatsApp(checked === true)}
                  />
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="send-whatsapp" className="flex items-center gap-2 cursor-pointer">
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp
                    </Label>
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
            </div>

            <DialogFooter className="gap-2 mt-4">
              <Button variant="outline" onClick={handleClose} disabled={isSending}>
                Annuler
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
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
