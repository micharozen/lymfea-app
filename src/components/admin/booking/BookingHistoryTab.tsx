import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Loader2, History, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBookingHistory, type BookingAuditEntry } from "@/hooks/booking/useBookingHistory";
import { formatPrice } from "@/lib/formatPrice";
import { EmailPreviewDialog } from "./EmailPreviewDialog";
import { effectivePaymentStatus } from "@/lib/clientTypePayment";
import i18n from "@/i18n";
import { getDateLocale } from "@/lib/dateLocale";

/** Champs de l'audit affichés dans l'historique (les autres sont ignorés). */
const AUDITED_FIELDS = [
  "status",
  "payment_status",
  "therapist_id",
  "therapist_name",
  "booking_date",
  "booking_time",
  "duration",
  "total_price",
  "payment_method",
  "room_id",
] as const;

/** Traduction avec repli sur la valeur brute quand la clé n'existe pas. */
function translateValue(group: string, value: string): string {
  const label = i18n.t(`admin:bookingHistory.${group}.${value}`, { defaultValue: "" });
  return label || value;
}

function formatValue(
  field: string,
  value: unknown,
  // Autres valeurs du même snapshot d'audit : permettent de savoir si le
  // paiement était une facturation partenaire (stockée "paid").
  siblingValues: Record<string, unknown> = {},
): string {
  if (value === null || value === undefined || value === "") return "—";

  if (field === "status") return translateValue("statusLabels", String(value));
  if (field === "payment_status") {
    const displayed = effectivePaymentStatus(
      siblingValues.payment_method as string | null | undefined,
      value as string,
    );
    return translateValue("paymentStatusLabels", String(displayed));
  }
  if (field === "payment_method") return translateValue("paymentMethodLabels", String(value));
  if (field === "total_price") return `${Number(value).toFixed(2)} €`;
  if (field === "duration") return i18n.t("admin:bookingHistory.minutes", { count: Number(value) });
  if (field === "booking_time" && typeof value === "string") return value.substring(0, 5);

  return String(value);
}

function getChangedFields(entry: BookingAuditEntry) {
  const oldVals = entry.old_values ?? {};
  const newVals = entry.new_values ?? {};

  // Deduplicate: if therapist_id changed, skip therapist_name separately
  const allKeys = new Set([...Object.keys(oldVals), ...Object.keys(newVals)]);
  if (allKeys.has("therapist_id")) allKeys.delete("therapist_name");
  if (allKeys.has("room_id")) allKeys.delete("room_name");

  return Array.from(allKeys)
    .filter((key) => (AUDITED_FIELDS as readonly string[]).includes(key))
    .map((key) => {
      // For therapist_id / room_id, display the resolved name only — never fall
      // back to the raw UUID (shows "—" if the name couldn't be resolved).
      const displayKey =
        key === "therapist_id" ? "therapist_name" : key === "room_id" ? "room_name" : key;
      return {
        field: key,
        label: i18n.t(`admin:bookingHistory.fields.${key}`),
        oldValue: formatValue(displayKey, oldVals[displayKey], oldVals),
        newValue: formatValue(displayKey, newVals[displayKey], newVals),
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

function renderActionLabel(entry: BookingAuditEntry): string | null {
  const newVals = (entry.new_values ?? {}) as Record<string, unknown>;
  const action = typeof newVals.action === "string" ? newVals.action : null;

  if (action === "email_sent") {
    const emailType = typeof newVals.email_type === "string" ? newVals.email_type : "";
    const base =
      i18n.t(`admin:bookingHistory.emailTypes.${emailType}`, { defaultValue: "" }) ||
      i18n.t("admin:bookingHistory.actions.emailSent");
    const recipients = Array.isArray(newVals.recipients) ? (newVals.recipients as string[]) : [];
    return recipients.length
      ? i18n.t("admin:bookingHistory.actions.withRecipients", {
          label: base,
          recipients: recipients.join(", "),
        })
      : base;
  }

  if (action === "refund") {
    const amount = typeof newVals.amount === "number" ? newVals.amount : null;
    const isPartial = newVals.is_partial === true;
    const label =
      amount != null
        ? i18n.t("admin:bookingHistory.actions.refundWithAmount", { amount: formatPrice(amount) })
        : i18n.t("admin:bookingHistory.actions.refund");
    return isPartial
      ? i18n.t("admin:bookingHistory.actions.partialSuffix", { label })
      : label;
  }

  if (action === "payment_link_sent") {
    const channels = Array.isArray(newVals.channels) ? newVals.channels as string[] : [];
    const labels: string[] = [];
    if (channels.includes("email") && typeof newVals.email === "string") {
      labels.push(i18n.t("admin:bookingHistory.channels.emailTo", { email: newVals.email }));
    } else if (channels.includes("email")) {
      labels.push(i18n.t("admin:bookingHistory.channels.email"));
    }
    if (channels.includes("sms") && typeof newVals.phone === "string") {
      labels.push(i18n.t("admin:bookingHistory.channels.smsTo", { phone: newVals.phone }));
    } else if (channels.includes("sms")) {
      labels.push(i18n.t("admin:bookingHistory.channels.sms"));
    }
    return labels.length
      ? i18n.t("admin:bookingHistory.actions.paymentLinkSentVia", {
          channels: labels.join(i18n.t("admin:bookingHistory.channels.joiner")),
        })
      : i18n.t("admin:bookingHistory.actions.paymentLinkSent");
  }

  return action ? i18n.t("admin:bookingHistory.actions.generic", { action }) : null;
}

interface BookingHistoryTabProps {
  bookingId: string;
  enabled: boolean;
}

export function BookingHistoryTab({ bookingId, enabled }: BookingHistoryTabProps) {
  const { t, i18n: i18nInstance } = useTranslation(["admin", "common"]);
  const dateLocale = getDateLocale(i18nInstance.language);
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
        <p className="text-sm">{t('bookingHistory.empty')}</p>
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
                    title={t('bookingHistory.at', {
                      date: format(dateObj, 'd MMMM yyyy', { locale: dateLocale }),
                      time: format(dateObj, 'HH:mm:ss'),
                    })}
                  >
                    {t('bookingHistory.at', {
                      date: format(dateObj, 'dd/MM/yyyy'),
                      time: format(dateObj, 'HH:mm:ss'),
                    })}
                    {/* (il y a {formatDistanceToNow(dateObj, { addSuffix: true, locale: fr, includeSeconds:true })}) */}
                    {/* {format(dateObj)} */}
                    {/* {formatDistanceToNow(dateObj, { addSuffix: true, locale: fr })} */}
                  </span>
                  {entry.changed_by_name && (
                    <span className="text-xs font-medium text-gray-500">
                      {t('bookingHistory.by', { name: entry.changed_by_name })}
                    </span>
                  )}
                </div>

                {isInsert(entry) ? (
                  <p className="text-sm text-green-600 font-medium">{t('bookingHistory.created')}</p>
                ) : isAction(entry) ? (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-blue-600 font-medium">{renderActionLabel(entry) ?? t('bookingHistory.actions.fallback')}</p>
                    {hasEmailPreview(entry) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setPreviewAuditId(entry.id)}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                        {t('bookingHistory.preview')}
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
