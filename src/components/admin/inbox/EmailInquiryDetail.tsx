import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

import type { EmailInquiry, EmailInquiryParsedData } from "@/hooks/inbox/useEmailInquiries";
import { ConvertToBookingDialog } from "./ConvertToBookingDialog";

interface Props {
  inquiry: EmailInquiry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-sm font-medium text-right">{value || <span className="text-muted-foreground italic">—</span>}</span>
    </div>
  );
}

function ParsedSummary({ parsed, t }: { parsed: EmailInquiryParsedData; t: (k: string) => string }) {
  const fullName = [parsed.client_first_name, parsed.client_last_name].filter(Boolean).join(" ");
  const dateTime = [parsed.requested_date, parsed.requested_time].filter(Boolean).join(" · ");
  const tm = parsed.treatment_match;

  return (
    <div className="space-y-1">
      <Row label={t("inbox.detail.client")} value={fullName || null} />
      <Row label={t("inbox.detail.email")} value={parsed.email} />
      <Row label={t("inbox.detail.phone")} value={parsed.phone} />
      <Row label={t("inbox.detail.dateTime")} value={dateTime || null} />
      <Row
        label={t("inbox.detail.treatment")}
        value={tm?.id ? `${tm.id.slice(0, 8)}… (${Math.round((tm.confidence ?? 0) * 100)}%)` : null}
      />
      <Row label={t("inbox.detail.guests")} value={parsed.guest_count?.toString()} />
      {parsed.notes && (
        <div className="pt-2">
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            {t("inbox.detail.notes")}
          </div>
          <p className="text-sm whitespace-pre-wrap bg-muted/40 rounded-md p-2">{parsed.notes}</p>
        </div>
      )}
    </div>
  );
}

export function EmailInquiryDetail({ inquiry, open, onOpenChange, onChanged }: Props) {
  const { t } = useTranslation("admin");
  const [busy, setBusy] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

  if (!inquiry) return null;

  const dismiss = async () => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("email_inquiries" as never)
        .update({ status: "dismissed" })
        .eq("id", inquiry.id);
      if (error) throw error;
      toast.success(t("inbox.detail.dismissed"));
      onChanged?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const body = inquiry.raw_body_text
    || (inquiry.raw_body_html ? inquiry.raw_body_html.replace(/<[^>]+>/g, " ") : "")
    || t("inbox.detail.noBody");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">{inquiry.subject ?? t("inbox.noSubject")}</SheetTitle>
          <SheetDescription className="text-xs">
            {format(new Date(inquiry.created_at), "dd/MM/yyyy HH:mm")} · {inquiry.from_address} → {inquiry.to_address}
          </SheetDescription>
        </SheetHeader>

        <Separator className="my-4" />

        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">{t("inbox.detail.parsed")}</h3>
              {inquiry.confidence_score !== null && (
                <Badge variant="outline">
                  {t("inbox.detail.confidence", { defaultValue: "Confidence" })}: {Math.round(inquiry.confidence_score * 100)}%
                </Badge>
              )}
            </div>
            {inquiry.parsed_data
              ? <ParsedSummary parsed={inquiry.parsed_data} t={t} />
              : <p className="text-sm text-muted-foreground italic">{t("inbox.detail.notParsed")}</p>}
          </div>

          {inquiry.error_message && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <div className="text-xs font-semibold text-red-700 uppercase mb-1">
                {t("inbox.detail.errorTitle")}
              </div>
              <p className="text-sm text-red-700">{inquiry.error_message}</p>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold mb-2">{t("inbox.detail.rawBody")}</h3>
            <pre className="text-xs whitespace-pre-wrap break-words bg-muted/40 rounded-md p-3 max-h-[300px] overflow-y-auto">
              {body}
            </pre>
          </div>
        </div>

        <Separator className="my-4" />

        <div className="flex gap-2 justify-end">
          {inquiry.status !== "dismissed" && inquiry.status !== "converted" && (
            <>
              <Button variant="outline" onClick={dismiss} disabled={busy}>
                {t("inbox.detail.dismissAction")}
              </Button>
              <Button
                onClick={() => setConvertOpen(true)}
                disabled={busy || !inquiry.hotel_id}
              >
                {t("inbox.detail.convertAction")}
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("inbox.detail.close")}
          </Button>
        </div>

        <ConvertToBookingDialog
          inquiry={inquiry}
          open={convertOpen}
          onOpenChange={setConvertOpen}
          onConverted={() => {
            onChanged?.();
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
