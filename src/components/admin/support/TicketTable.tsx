import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, ExternalLink, Paperclip } from "lucide-react";
import { TablePagination } from "@/components/table/TablePagination";
import { TableSkeleton } from "@/components/table/TableSkeleton";
import { TableEmptyState } from "@/components/table/TableEmptyState";
import { SortableTableHead } from "@/components/table/SortableTableHead";
import { usePagination } from "@/hooks/usePagination";
import { useTableSort } from "@/hooks/useTableSort";
import { format } from "date-fns";

export interface Ticket {
  id: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  created_by: string;
  creator_name: string | null;
  creator_role: string | null;
  notion_page_id: string | null;
  screenshot_urls: string[];
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

const CATEGORY_STYLES: Record<string, string> = {
  question: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  billing: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  booking: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  problem: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  other: "bg-muted text-muted-foreground",
};

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  urgent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  in_progress: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  resolved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  closed: "bg-muted text-muted-foreground",
};

interface TicketTableProps {
  tickets: Ticket[];
  loading: boolean;
  isAdmin: boolean;
  showClosedAt?: boolean;
  onStatusChange: (ticketId: string, newStatus: string) => void;
  onCreateClick: () => void;
  emptyMessage: string;
  emptyActionLabel: string;
  itemsPerPage: number;
}

export function TicketTable({
  tickets,
  loading,
  isAdmin,
  showClosedAt = false,
  onStatusChange,
  onCreateClick,
  emptyMessage,
  emptyActionLabel,
  itemsPerPage,
}: TicketTableProps) {
  const { t } = useTranslation("admin");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [previewTicket, setPreviewTicket] = useState<Ticket | null>(null);
  const { toggleSort, getSortDirection, sortItems } = useTableSort<string>();

  const filteredTickets = useMemo(() => {
    let result = tickets;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.subject.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          (t.creator_name && t.creator_name.toLowerCase().includes(q))
      );
    }

    if (categoryFilter !== "all") {
      result = result.filter((t) => t.category === categoryFilter);
    }
    if (priorityFilter !== "all") {
      result = result.filter((t) => t.priority === priorityFilter);
    }

    return result;
  }, [tickets, searchQuery, categoryFilter, priorityFilter]);

  const sortedTickets = useMemo(() => {
    return sortItems(filteredTickets, (ticket, column) => {
      switch (column) {
        case "subject": return ticket.subject;
        case "created_at": return ticket.created_at;
        case "closed_at": return ticket.closed_at || "";
        case "priority": return ticket.priority;
        case "status": return ticket.status;
        default: return null;
      }
    });
  }, [filteredTickets, sortItems]);

  const { currentPage, setCurrentPage, totalPages, paginatedItems: paginatedTickets, needsPagination } = usePagination({
    items: sortedTickets,
    itemsPerPage,
  });

  const columnCount = showClosedAt ? 8 : 7;

  return (
    <div className="flex flex-col">
      <div className="p-4 border-b border-border flex flex-wrap gap-4 items-center flex-shrink-0">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder={t("support.search")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t("support.allCategories")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("support.allCategories")}</SelectItem>
            <SelectItem value="question">{t("support.categories.question")}</SelectItem>
            <SelectItem value="billing">{t("support.categories.billing")}</SelectItem>
            <SelectItem value="booking">{t("support.categories.booking")}</SelectItem>
            <SelectItem value="problem">{t("support.categories.problem")}</SelectItem>
            <SelectItem value="other">{t("support.categories.other")}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t("support.allPriorities")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("support.allPriorities")}</SelectItem>
            <SelectItem value="low">{t("support.priorities.low")}</SelectItem>
            <SelectItem value="medium">{t("support.priorities.medium")}</SelectItem>
            <SelectItem value="high">{t("support.priorities.high")}</SelectItem>
            <SelectItem value="urgent">{t("support.priorities.urgent")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <Table className="text-xs w-full table-fixed min-w-[900px]">
          <TableHeader>
            <TableRow className="bg-muted/20 h-8">
              <SortableTableHead column="subject" sortDirection={getSortDirection("subject")} onSort={toggleSort} className="w-[25%]">
                {t("support.subject")}
              </SortableTableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 w-[10%]">
                {t("support.category")}
              </TableHead>
              <SortableTableHead column="priority" sortDirection={getSortDirection("priority")} onSort={toggleSort} className="w-[10%]">
                {t("support.priority")}
              </SortableTableHead>
              <SortableTableHead column="status" sortDirection={getSortDirection("status")} onSort={toggleSort} className="w-[12%]">
                {t("support.status")}
              </SortableTableHead>
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 w-[14%]">
                {t("support.createdBy")}
              </TableHead>
              <SortableTableHead column="created_at" sortDirection={getSortDirection("created_at")} onSort={toggleSort} className="w-[9%]">
                {t("support.createdAt")}
              </SortableTableHead>
              {showClosedAt && (
                <SortableTableHead column="closed_at" sortDirection={getSortDirection("closed_at")} onSort={toggleSort} className="w-[9%]">
                  {t("support.closedAt")}
                </SortableTableHead>
              )}
              <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 text-right w-[11%]">
                {t("support.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton rows={itemsPerPage} columns={columnCount} />
          ) : paginatedTickets.length === 0 ? (
            <TableEmptyState
              colSpan={columnCount}
              icon={Search}
              message={emptyMessage}
              actionLabel={emptyActionLabel}
              onAction={onCreateClick}
            />
          ) : (
            <TableBody>
              {paginatedTickets.map((ticket) => (
                <TableRow key={ticket.id} className="h-10 max-h-10 hover:bg-muted/50 transition-colors">
                  <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-foreground font-medium">{ticket.subject}</span>
                      {ticket.screenshot_urls.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewTicket(ticket);
                          }}
                          className="flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                          title={t("support.viewScreenshots")}
                        >
                          <Paperclip className="h-3 w-3" />
                          <span className="text-[10px]">{ticket.screenshot_urls.length}</span>
                        </button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                    <Badge variant="secondary" className={cn("text-[10px] px-2 py-0.5 border-0", CATEGORY_STYLES[ticket.category])}>
                      {t(`support.categories.${ticket.category}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                    <Badge variant="secondary" className={cn("text-[10px] px-2 py-0.5 border-0", PRIORITY_STYLES[ticket.priority])}>
                      {t(`support.priorities.${ticket.priority}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                    {isAdmin ? (
                      <Select
                        value={ticket.status}
                        onValueChange={(value) => onStatusChange(ticket.id, value)}
                      >
                        <SelectTrigger className="h-6 text-[10px] w-auto min-w-[100px] border-0 bg-transparent p-0">
                          <Badge variant="secondary" className={cn("text-[10px] px-2 py-0.5 border-0", STATUS_STYLES[ticket.status])}>
                            {t(`support.statuses.${ticket.status}`)}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">{t("support.statuses.open")}</SelectItem>
                          <SelectItem value="in_progress">{t("support.statuses.in_progress")}</SelectItem>
                          <SelectItem value="resolved">{t("support.statuses.resolved")}</SelectItem>
                          <SelectItem value="closed">{t("support.statuses.closed")}</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary" className={cn("text-[10px] px-2 py-0.5 border-0", STATUS_STYLES[ticket.status])}>
                        {t(`support.statuses.${ticket.status}`)}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                    <div className="truncate">
                      <span className="text-foreground">{ticket.creator_name || "-"}</span>
                      {ticket.creator_role && (
                        <span className="text-muted-foreground ml-1 text-[10px]">({ticket.creator_role})</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                    <span className="truncate block text-foreground">
                      {format(new Date(ticket.created_at), "dd/MM/yyyy")}
                    </span>
                  </TableCell>
                  {showClosedAt && (
                    <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                      <span className="truncate block text-foreground">
                        {ticket.closed_at
                          ? format(new Date(ticket.closed_at), "dd/MM/yyyy")
                          : "-"}
                      </span>
                    </TableCell>
                  )}
                  <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden text-right">
                    {ticket.notion_page_id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() =>
                          window.open(
                            `https://notion.so/${ticket.notion_page_id!.replace(/-/g, "")}`,
                            "_blank"
                          )
                        }
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          )}
        </Table>
      </div>

      {needsPagination && (
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredTickets.length}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          itemName="tickets"
        />
      )}

      {/* Screenshot Preview Dialog */}
      <Dialog open={!!previewTicket} onOpenChange={(open) => { if (!open) setPreviewTicket(null); }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Paperclip className="h-4 w-4" />
              {previewTicket?.subject}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {previewTicket?.screenshot_urls.map((url, index) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg overflow-hidden border border-border hover:border-foreground/20 transition-colors"
              >
                <img
                  src={url}
                  alt={`Screenshot ${index + 1}`}
                  className="w-full h-auto object-contain max-h-[300px] bg-muted"
                />
              </a>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
