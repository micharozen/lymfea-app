import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Inbox, Search, AlertCircle, CheckCircle2, Clock, XCircle, ArrowUp, ArrowDown, ArrowUpDown, MailCheck } from "lucide-react";

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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const ARCHIVE_AGE_DAYS = 10;
const ARCHIVE_AGE_MS = ARCHIVE_AGE_DAYS * 24 * 60 * 60 * 1000;

import {
  useEmailInquiries,
  type EmailInquiry,
  type EmailInquiryStatus,
} from "@/hooks/inbox/useEmailInquiries";
import { EmailInquiryDetail } from "@/components/admin/inbox/EmailInquiryDetail";

// Inbox lists root inbound rows only; outbound `sent` rows never appear here.
const STATUS_OPTIONS: Array<EmailInquiryStatus | "all"> = [
  "all",
  "parsed",
  "received",
  "replied",
  "converted",
  "dismissed",
  "failed",
];

const STATUS_DISPLAY: Partial<Record<EmailInquiryStatus, { tkey: string; cls: string; Icon: typeof Clock }>> = {
  received: { tkey: "inbox.status.received", cls: "bg-blue-50 text-blue-700 border-blue-200", Icon: Clock },
  parsed: { tkey: "inbox.status.parsed", cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: AlertCircle },
  replied: { tkey: "inbox.status.replied", cls: "bg-indigo-50 text-indigo-700 border-indigo-200", Icon: MailCheck },
  converted: { tkey: "inbox.status.converted", cls: "bg-green-50 text-green-700 border-green-200", Icon: CheckCircle2 },
  dismissed: { tkey: "inbox.status.dismissed", cls: "bg-gray-50 text-gray-600 border-gray-200", Icon: XCircle },
  failed: { tkey: "inbox.status.failed", cls: "bg-red-50 text-red-700 border-red-200", Icon: XCircle },
};

function statusBadge(status: EmailInquiryStatus, t: (k: string, opts?: Record<string, unknown>) => string) {
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

function formatConfidence(score: number | null): string {
  if (score === null || Number.isNaN(score)) return "—";
  return `${Math.round(score * 100)}%`;
}

function confidenceClass(score: number | null): string {
  if (score === null || Number.isNaN(score)) return "text-muted-foreground";
  if (score >= 0.8) return "text-emerald-700";
  if (score >= 0.5) return "text-amber-700";
  return "text-red-700";
}

type SortKey = "received" | "status" | "confidence";
type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<EmailInquiryStatus, number> = {
  received: 0,
  parsed: 1,
  failed: 2,
  replied: 3,
  converted: 4,
  dismissed: 5,
  sent: 6,
};

export default function EmailInbox() {
  const { t } = useTranslation("admin");
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [statusFilter, setStatusFilter] = useState<EmailInquiryStatus | "all">("all");
  const [venueFilter, setVenueFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<EmailInquiry | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("received");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data: inquiries = [], isLoading, refetch } = useEmailInquiries({ status: statusFilter });

  const venueOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const inq of inquiries) {
      if (inq.hotel?.id && inq.hotel?.name) map.set(inq.hotel.id, inq.hotel.name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [inquiries]);

  const archivedCutoff = useMemo(() => Date.now() - ARCHIVE_AGE_MS, []);
  const archivedCount = useMemo(
    () => inquiries.filter(i => new Date(i.created_at).getTime() < archivedCutoff).length,
    [inquiries, archivedCutoff],
  );

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const base = inquiries.filter(inq => {
      const isArchived = new Date(inq.created_at).getTime() < archivedCutoff;
      if (tab === "archived" ? !isArchived : isArchived) return false;
      if (venueFilter !== "all" && inq.hotel?.id !== venueFilter) return false;
      if (!q) return true;
      return (
        inq.from_address.toLowerCase().includes(q)
        || inq.to_address.toLowerCase().includes(q)
        || (inq.subject ?? "").toLowerCase().includes(q)
        || (inq.hotel?.name ?? "").toLowerCase().includes(q)
      );
    });

    const sorted = [...base].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "received") {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortKey === "status") {
        cmp = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
      } else {
        const av = a.confidence_score ?? -1;
        const bv = b.confidence_score ?? -1;
        cmp = av - bv;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [inquiries, searchQuery, venueFilter, sortKey, sortDir, tab, archivedCutoff]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "confidence" ? "desc" : "desc");
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  return (
    <div className="bg-background flex flex-col min-h-0">
      <div className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-medium tracking-tight flex items-center gap-2">
              <Inbox className="h-5 w-5 translate-y-[1px]" />
              {t("inbox.title")}
            </h1>
            <p className="text-muted-foreground mt-1">{t("inbox.description")}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 md:px-6 pb-4 md:pb-6">
        <div className="bg-card rounded-lg border border-border flex flex-col">
          <div className="px-4 border-b border-border">
            <Tabs value={tab} onValueChange={v => setTab(v as "active" | "archived")}>
              <TabsList className="h-auto gap-4 rounded-none bg-transparent p-0">
                <TabsTrigger
                  value="active"
                  className="rounded-none border-b-2 border-transparent px-1 py-2.5 text-sm font-normal text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:font-medium data-[state=active]:shadow-none"
                >
                  {t("inbox.tabs.active", { defaultValue: "Actifs" })}
                </TabsTrigger>
                <TabsTrigger
                  value="archived"
                  className="rounded-none border-b-2 border-transparent px-1 py-2.5 text-sm font-normal text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:font-medium data-[state=active]:shadow-none"
                >
                  {t("inbox.tabs.archived", { defaultValue: "Archivés" })}
                  {archivedCount > 0 && (
                    <Badge variant="secondary" className="ml-2 h-5 px-1.5 font-normal">
                      {archivedCount}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
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

            <Select value={venueFilter} onValueChange={setVenueFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder={t("inbox.venueFilter", { defaultValue: "Tous les lieux" })} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("inbox.allVenues", { defaultValue: "Tous les lieux" })}</SelectItem>
                {venueOptions.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
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
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => toggleSort("received")}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {t("inbox.columns.received")}
                      <SortIcon k="received" />
                    </button>
                  </TableHead>
                  <TableHead>{t("inbox.columns.from")}</TableHead>
                  <TableHead>{t("inbox.columns.venue")}</TableHead>
                  <TableHead>{t("inbox.columns.subject")}</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => toggleSort("status")}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {t("inbox.columns.status")}
                      <SortIcon k="status" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort("confidence")}
                      className="inline-flex items-center gap-1 hover:text-foreground ml-auto"
                    >
                      {t("inbox.columns.confidence")}
                      <SortIcon k="confidence" />
                    </button>
                  </TableHead>
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
                      <TableCell className={cn("text-right text-sm tabular-nums font-medium", confidenceClass(inq.confidence_score))}>
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
