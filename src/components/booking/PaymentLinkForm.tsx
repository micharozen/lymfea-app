import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Mail,
  MessageSquare,
  Send,
  CheckCircle2,
  AlertCircle,
  Copy,
} from "lucide-react";
import { invokeEdgeFunction, invokeStripe } from "@/lib/supabaseEdgeFunctions";
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
  currency?: string;
}

interface PaymentLinkFormProps {
  booking: BookingData;
  onSuccess?: () => void;
  onSkip?: () => void;
  showSkipButton?: boolean;
}

type Language = "fr" | "en";

interface SendResult {
  success: boolean;
  emailSent?: boolean;
  smsSent?: boolean;
  paymentLinkUrl?: string;
  error?: string;
}

function buildDefaultSmsBody(language: Language, booking: BookingData): string {
  const formattedDate = new Date(booking.booking_date).toLocaleDateString(
    language === "fr" ? "fr-FR" : "en-US",
    { day: "numeric", month: "long" }
  );
  const time = booking.booking_time?.substring(0, 5) ?? "";
  const total = formatPrice(booking.total_price, booking.currency || "EUR");
  const venue = booking.hotel_name || (language === "fr" ? "votre établissement" : "your venue");

  if (language === "fr") {
    return `Bonjour ${booking.client_first_name}, votre réservation chez ${venue} le ${formattedDate} à ${time} (${total}). Merci de régler via le lien ci-dessous :`;
  }
  return `Hello ${booking.client_first_name}, your booking at ${venue} on ${formattedDate} at ${time} (${total}). Please pay via the link below:`;
}

export function PaymentLinkForm({
  booking,
  onSuccess,
  onSkip,
  showSkipButton = false,
}: PaymentLinkFormProps) {
  const [language, setLanguage] = useState<Language>("fr");
  const [sendEmail, setSendEmail] = useState(true);
  const [sendSms, setSendSms] = useState(false);
  const [clientEmail, setClientEmail] = useState(booking.client_email || "");
  const [clientPhone, setClientPhone] = useState(booking.phone || "");
  const [smsBody, setSmsBody] = useState(() => buildDefaultSmsBody("fr", booking));
  const smsEditedRef = useRef(false);
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(true);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsGenerating(true);
      setGenerateError(null);
      try {
        const { data, error } = await invokeEdgeFunction<
          { bookingId: string; language: Language; mode: 'generate' },
          { success: boolean; paymentLinkUrl: string }
        >("send-payment-link", {
          body: { bookingId: booking.id, language: 'fr', mode: 'generate' },
        });
        if (cancelled) return;
        if (error) {
          setGenerateError(error.message || "Erreur lors de la génération du lien");
        } else if (data?.paymentLinkUrl) {
          setPaymentLinkUrl(data.paymentLinkUrl);
        }
      } catch (err) {
        if (!cancelled) {
          setGenerateError(err instanceof Error ? err.message : "Erreur inconnue");
        }
      } finally {
        if (!cancelled) setIsGenerating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [booking.id]);

  const handleCopyGeneratedLink = async () => {
    if (!paymentLinkUrl) return;
    try {
      await navigator.clipboard.writeText(paymentLinkUrl);
      toast({ title: "Lien copié", description: "Le lien de paiement a été copié dans le presse-papiers." });
    } catch {
      toast({ title: "Erreur", description: "Impossible de copier le lien", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (!smsEditedRef.current) {
      setSmsBody(buildDefaultSmsBody(language, booking));
    }
  }, [language, booking]);

  const handleSmsBodyChange = (value: string) => {
    smsEditedRef.current = true;
    setSmsBody(value);
  };

  const canSend = (sendEmail || sendSms) &&
    (!sendEmail || clientEmail) &&
    (!sendSms || clientPhone);

  const smsSegments = useMemo(() => {
    const approxLength = smsBody.length + 30;
    if (approxLength <= 160) return 1;
    return Math.ceil(approxLength / 153);
  }, [smsBody]);

  const handleSend = async () => {
    if (!canSend) return;

    setIsSending(true);
    setResult(null);

    const channels: ("email" | "sms")[] = [];
    if (sendEmail) channels.push("email");
    if (sendSms) channels.push("sms");

    try {
      const { data, error } = await invokeStripe<{
        success: boolean;
        paymentLinkUrl: string;
        emailSent: boolean;
        whatsappSent: boolean;
        errors?: string[];
      }>("send-payment-link", {
        bookingId: booking.id,
        language,
        channels,
        clientEmail: sendEmail ? clientEmail : undefined,
        clientPhone: sendSms ? clientPhone : undefined,
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
          smsSent: data.smsSent,
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

  const handleCopyLink = async () => {
    if (!result?.paymentLinkUrl) return;
    try {
      await navigator.clipboard.writeText(result.paymentLinkUrl);
      toast({ title: "Lien copié", description: "Le lien de paiement a été copié dans le presse-papiers." });
    } catch {
      toast({ title: "Erreur", description: "Impossible de copier le lien", variant: "destructive" });
    }
  };

  if (result?.success) {
    return (
      <div className="py-6 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Lien envoyé avec succès !</h3>
        <div className="text-sm text-muted-foreground space-y-1">
          {result.emailSent && <p>Email envoyé à {clientEmail}</p>}
          {result.smsSent && <p>SMS envoyé à {clientPhone}</p>}
        </div>
        {result.paymentLinkUrl && (
          <div className="mt-4 p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground mb-2">Lien de paiement :</p>
            <a
              href={result.paymentLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline break-all"
            >
              {result.paymentLinkUrl}
            </a>
            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={handleCopyLink}>
                <Copy className="h-3.5 w-3.5 mr-2" />
                Copier le lien
              </Button>
            </div>
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
      <div className="flex items-center gap-2">
        <Send className="h-5 w-5" />
        <h3 className="text-lg font-semibold">Envoyer le lien de paiement</h3>
      </div>

      <div className="p-3 bg-muted/50 rounded-lg text-sm">
        <p className="font-medium">Réservation #{booking.booking_id}</p>
        <p className="text-muted-foreground">
          {booking.client_first_name} {booking.client_last_name} - {formatPrice(booking.total_price, booking.currency || 'EUR')}
        </p>
      </div>

      <div className="p-3 border rounded-lg bg-muted/30 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Lien de paiement</Label>
          {paymentLinkUrl && (
            <Button variant="ghost" size="sm" onClick={handleCopyGeneratedLink} className="h-7 px-2">
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copier
            </Button>
          )}
        </div>
        {isGenerating ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Génération du lien…
          </div>
        ) : generateError ? (
          <p className="text-sm text-destructive">{generateError}</p>
        ) : paymentLinkUrl ? (
          <a
            href={paymentLinkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline break-all"
          >
            {paymentLinkUrl}
          </a>
        ) : null}
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

        <div className="p-3 border rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="send-sms" className="flex items-center gap-2 cursor-pointer font-medium">
              <MessageSquare className="h-4 w-4 text-emerald-500" />
              SMS
            </Label>
            <Switch
              id="send-sms"
              checked={sendSms}
              onCheckedChange={setSendSms}
            />
          </div>
          {sendSms && (
            <div className="space-y-2">
              <Input
                type="tel"
                placeholder="+33612345678"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
              />
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sms-body" className="text-xs text-muted-foreground">
                    Contenu du SMS
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    {smsBody.length} car. · {smsSegments} SMS
                  </span>
                </div>
                <Textarea
                  id="sms-body"
                  rows={4}
                  value={smsBody}
                  onChange={(e) => handleSmsBodyChange(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Le lien Stripe sera ajouté automatiquement à la fin du message.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

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
