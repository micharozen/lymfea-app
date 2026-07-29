import { AlertCircle, CheckCircle2, Clock, MailCheck, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EmailInquiryStatus } from "@/hooks/inbox/useEmailInquiries";

/**
 * Status presentation shared by the inbox table and the kanban board.
 * `sent` is absent on purpose: it only ever lands on outbound rows, which the
 * inbox never lists.
 */
export const STATUS_DISPLAY: Partial<Record<EmailInquiryStatus, { tkey: string; cls: string; Icon: typeof Clock }>> = {
  received: { tkey: "inbox.status.received", cls: "bg-blue-50 text-blue-700 border-blue-200", Icon: Clock },
  parsed: { tkey: "inbox.status.parsed", cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: AlertCircle },
  replied: { tkey: "inbox.status.replied", cls: "bg-indigo-50 text-indigo-700 border-indigo-200", Icon: MailCheck },
  converted: { tkey: "inbox.status.converted", cls: "bg-green-50 text-green-700 border-green-200", Icon: CheckCircle2 },
  dismissed: { tkey: "inbox.status.dismissed", cls: "bg-gray-50 text-gray-600 border-gray-200", Icon: XCircle },
  failed: { tkey: "inbox.status.failed", cls: "bg-red-50 text-red-700 border-red-200", Icon: XCircle },
};

/** Pipeline order, used both to sort the table and to lay out the kanban columns. */
export const STATUS_ORDER: Record<EmailInquiryStatus, number> = {
  received: 0,
  parsed: 1,
  failed: 2,
  replied: 3,
  converted: 4,
  dismissed: 5,
  sent: 6,
};

export const KANBAN_COLUMNS: EmailInquiryStatus[] = [
  "received",
  "parsed",
  "failed",
  "replied",
  "converted",
  "dismissed",
];

type Translate = (key: string, opts?: Record<string, unknown>) => string;

export function statusBadge(status: EmailInquiryStatus, t: Translate) {
  const cfg = STATUS_DISPLAY[status];
  if (!cfg) {
    return <Badge variant="outline" className="gap-1 font-normal">{status}</Badge>;
  }
  const Icon = cfg.Icon;
  return (
    <Badge variant="outline" className={cn("gap-1 font-normal", cfg.cls)}>
      <Icon className="h-3 w-3" />
      {t(cfg.tkey, { defaultValue: status })}
    </Badge>
  );
}

export function formatConfidence(score: number | null): string {
  if (score === null || Number.isNaN(score)) return "—";
  return `${Math.round(score * 100)}%`;
}

export function confidenceClass(score: number | null): string {
  if (score === null || Number.isNaN(score)) return "text-muted-foreground";
  if (score >= 0.8) return "text-emerald-700";
  if (score >= 0.5) return "text-amber-700";
  return "text-red-700";
}
