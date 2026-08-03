import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Loader2,
  Mail,
  MessageSquare,
  Send,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
} from "lucide-react";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { toast } from "@/hooks/use-toast";

type Language = "fr" | "en";

export interface ConfirmationBookingData {
  id: string;
  booking_id: number;
  client_first_name: string;
  client_last_name: string;
  client_email?: string | null;
  phone?: string | null;
  language?: string | null;
}

interface SendConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: ConfirmationBookingData;
  /** Un email de confirmation a déjà été envoyé (audit_log). */
  alreadySent?: boolean;
  /** Date du dernier envoi, affichée dans l'avertissement. */
  lastSentAt?: string | null;
  onSuccess?: () => void;
}

interface SendResult {
  success: boolean;
  emailSent?: boolean;
  smsSent?: boolean;
  error?: string;
}

export function SendConfirmationDialog({
  open,
  onOpenChange,
  booking,
  alreadySent = false,
  lastSentAt,
  onSuccess,
}: SendConfirmationDialogProps) {
  const defaultLanguage: Language = booking.language === "en" ? "en" : "fr";
  const [language, setLanguage] = useState<Language>(defaultLanguage);
  const [sendEmail, setSendEmail] = useState(Boolean(booking.client_email));
  const [sendSms, setSendSms] = useState(false);
  const [clientEmail, setClientEmail] = useState(booking.client_email || "");
  const [clientPhone, setClientPhone] = useState(booking.phone || "");
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  const canSend =
    (sendEmail || sendSms) && (!sendEmail || clientEmail) && (!sendSms || clientPhone);

  const close = () => {
    setResult(null);
    onOpenChange(false);
  };

  const handleSend = async () => {
    if (!canSend) return;

    setIsSending(true);
    setResult(null);

    try {
      const { data, error } = await invokeEdgeFunction<
        {
          bookingId: string;
          mode: "resend";
          channels: { email: boolean; sms: boolean };
          language: Language;
          clientEmail?: string;
          clientPhone?: string;
        },
        { success: boolean; emailSent: boolean; smsSent: boolean; skipped?: string }
      >("notify-booking-confirmed", {
        body: {
          bookingId: booking.id,
          mode: "resend",
          channels: { email: sendEmail, sms: sendSms },
          language,
          clientEmail: sendEmail ? clientEmail : undefined,
          clientPhone: sendSms ? clientPhone : undefined,
        },
      });

      if (error) {
        setResult({ success: false, error: error.message || "Erreur lors de l'envoi" });
        toast({
          title: "Erreur",
          description: error.message || "Erreur lors de l'envoi de la confirmation",
          variant: "destructive",
        });
      } else if (data?.skipped === "payment_not_engaged") {
        setResult({
          success: false,
          error:
            "Le paiement n'est pas engagé : la confirmation partira automatiquement une fois le paiement encaissé.",
        });
      } else if (data?.success) {
        setResult({ success: true, emailSent: data.emailSent, smsSent: data.smsSent });
        toast({ title: "Confirmation envoyée", description: "Le client a été notifié." });
        onSuccess?.();
      } else {
        setResult({ success: false, error: "L'envoi a échoué. Vérifiez l'email et le téléphone." });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      setResult({ success: false, error: message });
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="bo-refonte sendconf p-0 gap-0 sm:max-w-[520px] max-h-[90vh] overflow-y-auto [&>button]:hidden">
        {result?.success ? (
          <div className="sendconf-state ok">
            <DialogTitle asChild>
              <div className="ico"><CheckCircle2 className="h-6 w-6" /></div>
            </DialogTitle>
            <p className="ttl">Confirmation envoyée</p>
            <DialogDescription asChild>
              <div className="sub">
                {result.emailSent && <p>Email envoyé à {clientEmail}</p>}
                {result.smsSent && <p>SMS envoyé à {clientPhone}</p>}
              </div>
            </DialogDescription>
            <div className="acts">
              <button type="button" className="bo-btn primary" onClick={close}>Fermer</button>
            </div>
          </div>
        ) : result?.error ? (
          <div className="sendconf-state bad">
            <DialogTitle asChild>
              <div className="ico"><AlertCircle className="h-6 w-6" /></div>
            </DialogTitle>
            <p className="ttl">Envoi impossible</p>
            <DialogDescription asChild>
              <p className="sub">{result.error}</p>
            </DialogDescription>
            <div className="acts">
              <button type="button" className="bo-btn ghost" onClick={close}>Fermer</button>
              <button type="button" className="bo-btn primary" onClick={() => setResult(null)}>Réessayer</button>
            </div>
          </div>
        ) : (
          <>
            <div className="sendconf-head">
              <div className="min-w-0 flex-1">
                <DialogTitle className="subj">Envoyer la confirmation</DialogTitle>
                <DialogDescription asChild>
                  <div className="meta">
                    <span className="num">Réservation #{booking.booking_id}</span>
                    <span>·</span>
                    <span className="truncate">
                      {booking.client_first_name} {booking.client_last_name}
                    </span>
                  </div>
                </DialogDescription>
              </div>
              <button type="button" className="x" onClick={close} aria-label="Fermer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="sendconf-body">
              {alreadySent && (
                <div className="sendconf-warn">
                  <AlertTriangle className="h-4 w-4" />
                  <p>
                    Une confirmation a déjà été envoyée
                    {lastSentAt
                      ? ` le ${format(new Date(lastSentAt), "d MMM à HH:mm", { locale: fr })}`
                      : ""}
                    . Le client recevra un second message.
                  </p>
                </div>
              )}

              <div>
                <p className="bo-sec-title">Langue du message</p>
                <div className="bo-seg mt-2">
                  <button
                    type="button"
                    className={language === "fr" ? "active" : undefined}
                    onClick={() => setLanguage("fr")}
                  >
                    Français
                  </button>
                  <button
                    type="button"
                    className={language === "en" ? "active" : undefined}
                    onClick={() => setLanguage("en")}
                  >
                    English
                  </button>
                </div>
              </div>

              <div>
                <p className="bo-sec-title">Envoyer par</p>

                <div className={`sendconf-ch mt-2 ${sendEmail ? "on" : ""}`}>
                  <div className="row">
                    <label className="lbl" htmlFor="confirmation-email">
                      <Mail className="h-4 w-4" />
                      Email
                    </label>
                    <Switch id="confirmation-email" checked={sendEmail} onCheckedChange={setSendEmail} />
                  </div>
                  {sendEmail && (
                    <input
                      className="sendconf-input"
                      type="email"
                      placeholder="client@email.com"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                    />
                  )}
                </div>

                <div className={`sendconf-ch ${sendSms ? "on" : ""}`}>
                  <div className="row">
                    <label className="lbl" htmlFor="confirmation-sms">
                      <MessageSquare className="h-4 w-4" />
                      SMS
                    </label>
                    <Switch id="confirmation-sms" checked={sendSms} onCheckedChange={setSendSms} />
                  </div>
                  {sendSms && (
                    <input
                      className="sendconf-input"
                      type="tel"
                      placeholder="+33612345678"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="sendconf-actions">
              <button type="button" className="bo-btn ghost" onClick={close} disabled={isSending}>
                Annuler
              </button>
              <button
                type="button"
                className="bo-btn primary"
                onClick={handleSend}
                disabled={!canSend || isSending}
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Envoi en cours…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Envoyer
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
