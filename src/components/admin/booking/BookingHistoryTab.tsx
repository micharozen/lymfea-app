import { useState } from "react";
import { formatDistanceToNow, format, formatDate } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, History, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBookingHistory, type BookingAuditEntry } from "@/hooks/booking/useBookingHistory";
import { EmailPreviewDialog } from "./EmailPreviewDialog";

const FIELD_LABELS: Record<string, string> = {
  status: "Statut",
  payment_status: "Paiement",
  therapist_id: "Thérapeute",
  therapist_name: "Thérapeute",
  booking_date: "Date",
  booking_time: "Horaire",
  duration: "Durée",
  total_price: "Prix total",
  payment_method: "Méthode de paiement",
  room_id: "Salle",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  awaiting_payment: "En attente de paiement",
  awaiting_hairdresser_selection: "En attente de thérapeute",
  waiting_approval: "En attente d'approbation",
  quote_pending: "Devis en attente",
  alternative_proposed: "Alternative proposée",
  accepted: "Accepté",
  rejected: "Refusé",
  confirmed: "Confirmé",
  ongoing: "En cours",
  completed: "Terminé",
  cancelled: "Annulé",
  no_show: "No-show",
  expired: "Expiré",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  card: "Carte",
  tap_to_pay: "Tap to Pay",
  cash: "Espèces",
  room: "Facturé chambre",
  bundle: "Forfait",
  gift_amount: "Carte cadeau",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  paid: "Payé",
  failed: "Échoué",
  refunded: "Remboursé",
  charged_to_room: "Facturé chambre",
  pending_partner_billing: "Paiement partenaire",
  card_saved: "Carte enregistrée",
};

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";

  if (field === "status") return STATUS_LABELS[value as string] ?? String(value);
  if (field === "payment_status") return PAYMENT_STATUS_LABELS[value as string] ?? String(value);
  if (field === "payment_method") return PAYMENT_METHOD_LABELS[value as string] ?? String(value);
  if (field === "total_price") return `${Number(value).toFixed(2)} €`;
  if (field === "duration") return `${value} min`;
  if (field === "booking_time" && typeof value === "string") return value.substring(0, 5);

  return String(value);
}

function getChangedFields(entry: BookingAuditEntry) {
  const oldVals = entry.old_values ?? {};
  const newVals = entry.new_values ?? {};

  // Deduplicate: if therapist_id changed, skip therapist_name separately
  const allKeys = new Set([...Object.keys(oldVals), ...Object.keys(newVals)]);
  if (allKeys.has("therapist_id")) allKeys.delete("therapist_name");

  return Array.from(allKeys)
    .filter((key) => key in FIELD_LABELS)
    .map((key) => {
      // For therapist_id, display the resolved name only — never fall back to the
      // raw UUID (shows "—" if the name couldn't be resolved).
      const displayKey = key === "therapist_id" ? "therapist_name" : key;
      return {
        field: key,
        label: FIELD_LABELS[key],
        oldValue: formatValue(displayKey, oldVals[displayKey]),
        newValue: formatValue(displayKey, newVals[displayKey]),
      };
    });
}

function isInsert(entry: BookingAuditEntry) {
  return entry.change_type === "insert";
}

function isAction(entry: BookingAuditEntry) {
  return entry.change_type === "action";
}

function hasEmailPreview(entry: BookingAuditEntry): boolean {
  const newVals = (entry.new_values ?? {}) as Record<string, unknown>;
  if (newVals.action !== "email_sent") return false;
  // has_preview covers both stored HTML and Resend-backed template emails;
  // has_html kept for rows written before the hybrid change.
  return newVals.has_preview === true || newVals.has_html === true;
}

const EMAIL_TYPE_LABELS: Record<string, string> = {
  booking_confirmation: "Email de confirmation envoyé au client",
  booking_confirmed: "Email de confirmation de réservation envoyé",
  booking_notification: "Email de notification envoyé",
  new_booking_notifications: "Email de nouvelle réservation envoyé",
  payment_reminder: "Email de rappel de paiement envoyé",
  booking_cancelled: "Email d'annulation envoyé",
  payment_link_expired: "Email d'expiration du lien de paiement envoyé",
};

function renderActionLabel(entry: BookingAuditEntry): string | null {
  const newVals = (entry.new_values ?? {}) as Record<string, unknown>;
  const action = typeof newVals.action === "string" ? newVals.action : null;

  if (action === "email_sent") {
    const emailType = typeof newVals.email_type === "string" ? newVals.email_type : "";
    const base = EMAIL_TYPE_LABELS[emailType] ?? "Email envoyé";
    const recipients = Array.isArray(newVals.recipients) ? (newVals.recipients as string[]) : [];
    return recipients.length ? `${base} (${recipients.join(", ")})` : base;
  }

  if (action === "payment_link_sent") {
    const channels = Array.isArray(newVals.channels) ? newVals.channels as string[] : [];
    const labels: string[] = [];
    if (channels.includes("email") && typeof newVals.email === "string") {
      labels.push(`email à ${newVals.email}`);
    } else if (channels.includes("email")) {
      labels.push("email");
    }
    if (channels.includes("sms") && typeof newVals.phone === "string") {
      labels.push(`SMS au ${newVals.phone}`);
    } else if (channels.includes("sms")) {
      labels.push("SMS");
    }
    return `Lien de paiement envoyé${labels.length ? ` par ${labels.join(" et ")}` : ""}`;
  }

  return action ? `Action : ${action}` : null;
}

interface BookingHistoryTabProps {
  bookingId: string;
  enabled: boolean;
}

export function BookingHistoryTab({ bookingId, enabled }: BookingHistoryTabProps) {
  const { data: entries, isLoading } = useBookingHistory(bookingId, enabled);
  const [previewAuditId, setPreviewAuditId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <History className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">Aucun changement enregistré pour cette réservation.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6">
      <div className="relative border-l-2 border-gray-200 ml-4 space-y-6">
        {entries.map((entry) => {
          const fields = getChangedFields(entry);
          const dateObj = new Date(entry.changed_at);
          console.log(dateObj);
          /* console.log(formatDate(dateObj)); */

          return (
            <div key={entry.id} className="relative pl-8">
              {/* Timeline dot */}
              <div className="absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-primary bg-white" />

              <div className="bg-white rounded-lg border p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="text-xs text-muted-foreground"
                    title={format(dateObj, "d MMMM yyyy à HH:mm:ss", { locale: fr })}
                  >
                    Le {format(entry.changed_at, 'dd/MM/yyyy à HH:mm:ss')} 
                    {/* (il y a {formatDistanceToNow(dateObj, { addSuffix: true, locale: fr, includeSeconds:true })}) */}
                    {/* {format(dateObj)} */}
                    {/* {formatDistanceToNow(dateObj, { addSuffix: true, locale: fr })} */}
                  </span>
                  {entry.changed_by_name && (
                    <span className="text-xs font-medium text-gray-500">
                      par {entry.changed_by_name}
                    </span>
                  )}
                </div>

                {isInsert(entry) ? (
                  <p className="text-sm text-green-600 font-medium">Réservation créée</p>
                ) : isAction(entry) ? (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-blue-600 font-medium">{renderActionLabel(entry) ?? "Action"}</p>
                    {hasEmailPreview(entry) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setPreviewAuditId(entry.id)}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                        Aperçu
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {fields.map(({ field, label, oldValue, newValue }) => (
                      <div key={field} className="text-sm">
                        <span className="font-medium text-gray-700">{label}</span>
                        <span className="mx-2 text-gray-400">:</span>
                        <span className="text-red-500/80 line-through">{oldValue}</span>
                        <span className="mx-1.5 text-gray-400">→</span>
                        <span className="text-green-600 font-medium">{newValue}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <EmailPreviewDialog
        auditId={previewAuditId}
        open={previewAuditId !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewAuditId(null);
        }}
      />
    </div>
  );
}
