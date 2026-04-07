import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, LifeBuoy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { TablePagination } from "@/components/table/TablePagination";
import { TableSkeleton } from "@/components/table/TableSkeleton";
import { TableEmptyState } from "@/components/table/TableEmptyState";
import { SortableTableHead } from "@/components/table/SortableTableHead";
import { useLayoutCalculation } from "@/hooks/useLayoutCalculation";
import { useOverflowControl } from "@/hooks/useOverflowControl";
import { usePagination } from "@/hooks/usePagination";
import { useTableSort } from "@/hooks/useTableSort";
import { useUser } from "@/contexts/UserContext";
import { format } from "date-fns";

interface Ticket {
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

export default function SupportTickets() {
  const { t } = useTranslation("admin");
  const { isAdmin } = useUser();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Create form state
  const [formSubject, setFormSubject] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState("question");
  const [formPriority, setFormPriority] = useState("medium");

  const { headerRef, filtersRef, itemsPerPage } = useLayoutCalculation();
  const { toggleSort, getSortDirection, sortItems } = useTableSort<string>();

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tickets")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(t("support.toast.loadError"));
      setLoading(false);
      return;
    }

    setTickets(data || []);
    setLoading(false);
  };

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

    if (statusFilter !== "all") {
      result = result.filter((t) => t.status === statusFilter);
    }
    if (categoryFilter !== "all") {
      result = result.filter((t) => t.category === categoryFilter);
    }
    if (priorityFilter !== "all") {
      result = result.filter((t) => t.priority === priorityFilter);
    }

    return result;
  }, [tickets, searchQuery, statusFilter, categoryFilter, priorityFilter]);

  const sortedTickets = useMemo(() => {
    return sortItems(filteredTickets, (ticket, column) => {
      switch (column) {
        case "subject": return ticket.subject;
        case "created_at": return ticket.created_at;
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

  useOverflowControl(!loading && needsPagination);

  const handleCreate = async () => {
    if (!formSubject.trim() || !formDescription.trim()) {
      toast.error(t("support.toast.fieldsRequired"));
      return;
    }

    setSubmitting(true);
    const { error } = await invokeEdgeFunction("create-support-ticket", {
      body: {
        subject: formSubject.trim(),
        description: formDescription.trim(),
        category: formCategory,
        priority: formPriority,
      },
    });

    if (error) {
      toast.error(t("support.toast.createError"));
      setSubmitting(false);
      return;
    }

    toast.success(t("support.toast.created"));
    setCreateOpen(false);
    resetForm();
    setSubmitting(false);
    fetchTickets();
  };

  const resetForm = () => {
    setFormSubject("");
    setFormDescription("");
    setFormCategory("question");
    setFormPriority("medium");
  };

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    const { error } = await supabase
      .from("tickets")
      .update({ status: newStatus })
      .eq("id", ticketId);

    if (error) {
      toast.error(t("support.toast.statusError"));
      return;
    }

    toast.success(t("support.toast.statusUpdated"));
    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
    );
  };

  return (
    <div className={cn("bg-background flex flex-col", needsPagination ? "h-screen overflow-hidden" : "min-h-0")}>
      <div className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6" ref={headerRef}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <LifeBuoy className="h-5 w-5 text-gold-600" />
              {t("support.title")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t("support.description")}
            </p>
          </div>
          <Button className="flex-shrink-0 gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("support.createTicket")}
          </Button>
        </div>
      </div>

      <div className={cn("flex-1 px-4 md:px-6 pb-4 md:pb-6", needsPagination ? "overflow-hidden" : "")}>
        <div className={cn("bg-card rounded-lg border border-border flex flex-col", needsPagination ? "h-full" : "")}>
          <div ref={filtersRef} className="p-4 border-b border-border flex flex-wrap gap-4 items-center flex-shrink-0">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder={t("support.search")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder={t("support.allStatuses")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("support.allStatuses")}</SelectItem>
                <SelectItem value="open">{t("support.statuses.open")}</SelectItem>
                <SelectItem value="in_progress">{t("support.statuses.in_progress")}</SelectItem>
                <SelectItem value="resolved">{t("support.statuses.resolved")}</SelectItem>
                <SelectItem value="closed">{t("support.statuses.closed")}</SelectItem>
              </SelectContent>
            </Select>

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

          <div className={cn("flex-1", needsPagination ? "min-h-0 overflow-hidden" : "")}>
            <div className="overflow-x-auto h-full">
              <Table className="text-xs w-full table-fixed min-w-[900px]">
                <TableHeader>
                  <TableRow className="bg-muted/20 h-8">
                    <SortableTableHead column="subject" sortDirection={getSortDirection("subject")} onSort={toggleSort} className="w-[30%]">
                      {t("support.subject")}
                    </SortableTableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 w-[12%]">
                      {t("support.category")}
                    </TableHead>
                    <SortableTableHead column="priority" sortDirection={getSortDirection("priority")} onSort={toggleSort} className="w-[10%]">
                      {t("support.priority")}
                    </SortableTableHead>
                    <SortableTableHead column="status" sortDirection={getSortDirection("status")} onSort={toggleSort} className="w-[14%]">
                      {t("support.status")}
                    </SortableTableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 w-[14%]">
                      {t("support.createdBy")}
                    </TableHead>
                    <SortableTableHead column="created_at" sortDirection={getSortDirection("created_at")} onSort={toggleSort} className="w-[10%]">
                      {t("support.createdAt")}
                    </SortableTableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 text-right w-[10%]">
                      {t("support.actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                {loading ? (
                  <TableSkeleton rows={itemsPerPage} columns={7} />
                ) : paginatedTickets.length === 0 ? (
                  <TableEmptyState
                    colSpan={7}
                    icon={LifeBuoy}
                    message={t("support.empty")}
                    actionLabel={t("support.createTicket")}
                    onAction={() => setCreateOpen(true)}
                  />
                ) : (
                  <TableBody>
                    {paginatedTickets.map((ticket) => (
                      <TableRow key={ticket.id} className="h-10 max-h-10 hover:bg-muted/50 transition-colors">
                        <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                          <span className="truncate block text-foreground font-medium">{ticket.subject}</span>
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
                              onValueChange={(value) => handleStatusChange(ticket.id, value)}
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
        </div>
      </div>

      {/* Create Ticket Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LifeBuoy className="h-5 w-5 text-gold-600" />
              {t("support.createDialog.title")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("support.subject")}</Label>
              <Input
                placeholder={t("support.createDialog.subjectPlaceholder")}
                value={formSubject}
                onChange={(e) => setFormSubject(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("support.description")}</Label>
              <Textarea
                placeholder={t("support.createDialog.descriptionPlaceholder")}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("support.category")}</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="question">{t("support.categories.question")}</SelectItem>
                    <SelectItem value="billing">{t("support.categories.billing")}</SelectItem>
                    <SelectItem value="booking">{t("support.categories.booking")}</SelectItem>
                    <SelectItem value="problem">{t("support.categories.problem")}</SelectItem>
                    <SelectItem value="other">{t("support.categories.other")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("support.priority")}</Label>
                <Select value={formPriority} onValueChange={setFormPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t("support.priorities.low")}</SelectItem>
                    <SelectItem value="medium">{t("support.priorities.medium")}</SelectItem>
                    <SelectItem value="high">{t("support.priorities.high")}</SelectItem>
                    <SelectItem value="urgent">{t("support.priorities.urgent")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
              {t("support.createDialog.cancel")}
            </Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? t("support.createDialog.submitting") : t("support.createDialog.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
