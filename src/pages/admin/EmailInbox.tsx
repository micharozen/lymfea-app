import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Inbox, Search, AlertCircle, CheckCircle2, Clock, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import {
  useEmailInquiries,
  type EmailInquiry,
  type EmailInquiryStatus,
} from "@/hooks/inbox/useEmailInquiries";
import { EmailInquiryDetail } from "@/components/admin/inbox/EmailInquiryDetail";

const STATUS_OPTIONS: Array<EmailInquiryStatus | "all"> = [
  "all",
  "parsed",
  "received",
  "converted",
  "dismissed",
  "failed",
];

function statusBadge(status: EmailInquiryStatus, t: (k: string) => string) {
  const map: Record<EmailInquiryStatus, { label: string; cls: string; Icon: typeof Clock }> = {
    received: {
      label: t("inbox.status.received"),
      cls: "bg-blue-50 text-blue-700 border-blue-200",
      Icon: Clock,
    },
    parsed: {
      label: t("inbox.status.parsed"),
      cls: "bg-amber-50 text-amber-700 border-amber-200",
      Icon: AlertCircle,
    },
    converted: {
      label: t("inbox.status.converted"),
      cls: "bg-green-50 text-green-700 border-green-200",
      Icon: CheckCircle2,
    },
    dismissed: {
      label: t("inbox.status.dismissed"),
      cls: "bg-gray-50 text-gray-600 border-gray-200",
      Icon: XCircle,
    },
    failed: {
      label: t("inbox.status.failed"),
      cls: "bg-red-50 text-red-700 border-red-200",
      Icon: XCircle,
    },
  };
  const { label, cls, Icon } = map[status];
  return (
    <Badge variant="outline" className={cn("gap-1 font-normal", cls)}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

function formatConfidence(score: number | null): string {
  if (score === null || Number.isNaN(score)) return "—";
  return `${Math.round(score * 100)}%`;
}

export default function EmailInbox() {
  const { t } = useTranslation("admin");
  const [statusFilter, setStatusFilter] = useState<EmailInquiryStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<EmailInquiry | null>(null);

  const { data: inquiries = [], isLoading, refetch } = useEmailInquiries({ status: statusFilter });

  const filtered = useMemo(() => {
    if (!searchQuery) return inquiries;
    const q = searchQuery.toLowerCase();
    return inquiries.filter(inq =>
      inq.from_address.toLowerCase().includes(q)
      || inq.to_address.toLowerCase().includes(q)
      || (inq.subject ?? "").toLowerCase().includes(q)
      || (inq.hotel?.name ?? "").toLowerCase().includes(q),
    );
  }, [inquiries, searchQuery]);

  return (
    <div className="bg-background flex flex-col min-h-0">
      <div className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-medium tracking-tight flex items-center gap-2">
              <Inbox className="h-5 w-5" />
              {t("inbox.title")}
            </h1>
            <p className="text-muted-foreground mt-1">{t("inbox.description")}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 md:px-6 pb-4 md:pb-6">
        <div className="bg-card rounded-lg border border-border flex flex-col">
          <div className="p-4 border-b border-border flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder={t("inbox.searchPlaceholder")}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select
              value={statusFilter}
              onValueChange={v => setStatusFilter(v as EmailInquiryStatus | "all")}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(s => (
                  <SelectItem key={s} value={s}>
                    {s === "all" ? t("inbox.status.all") : t(`inbox.status.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm" onClick={() => refetch()}>
              {t("inbox.refresh")}
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("inbox.columns.received")}</TableHead>
                  <TableHead>{t("inbox.columns.from")}</TableHead>
                  <TableHead>{t("inbox.columns.venue")}</TableHead>
                  <TableHead>{t("inbox.columns.subject")}</TableHead>
                  <TableHead>{t("inbox.columns.status")}</TableHead>
                  <TableHead className="text-right">{t("inbox.columns.confidence")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                      {t("inbox.loading")}
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                      {t("inbox.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(inq => (
                    <TableRow
                      key={inq.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setSelected(inq)}
                    >
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(inq.created_at), "dd/MM/yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="font-medium">{inq.from_address}</TableCell>
                      <TableCell className="text-sm">
                        {inq.hotel?.name ?? <span className="text-muted-foreground italic">{t("inbox.unknownVenue")}</span>}
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate">
                        {inq.subject ?? <span className="text-muted-foreground italic">{t("inbox.noSubject")}</span>}
                      </TableCell>
                      <TableCell>{statusBadge(inq.status, t)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatConfidence(inq.confidence_score)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <EmailInquiryDetail
        inquiry={selected}
        open={selected !== null}
        onOpenChange={open => {
          if (!open) setSelected(null);
        }}
        onChanged={() => {
          setSelected(null);
          refetch();
        }}
      />
    </div>
  );
}
