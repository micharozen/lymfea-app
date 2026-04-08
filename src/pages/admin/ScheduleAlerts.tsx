import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Flag,
  Check,
  CheckCheck,
  ExternalLink,
  Smartphone,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PersonCell } from "@/components/table/EntityCell";
import { TablePagination } from "@/components/table/TablePagination";
import { TableSkeleton } from "@/components/table/TableSkeleton";
import { TableEmptyState } from "@/components/table/TableEmptyState";
import { SortableTableHead } from "@/components/table/SortableTableHead";
import { useLayoutCalculation } from "@/hooks/useLayoutCalculation";
import { useOverflowControl } from "@/hooks/useOverflowControl";
import { usePagination } from "@/hooks/usePagination";
import { useTableSort } from "@/hooks/useTableSort";
import { describeScheduleChange, formatShiftsSummary } from "@/lib/auditUtils";
import { format, formatDistanceToNow } from "date-fns";
import { fr, enUS } from "date-fns/locale";

interface AuditLogEntry {
  id: string;
  table_name: string;
  record_id: string;
  changed_by: string | null;
  changed_at: string;
  change_type: string;
  old_values: {
    is_available: boolean;
    shifts: { start: string; end: string }[];
    is_manually_edited: boolean;
  } | null;
  new_values: {
    is_available: boolean;
    shifts: { start: string; end: string }[];
    is_manually_edited: boolean;
  } | null;
  source: string;
  metadata: {
    therapist_id?: string;
    affected_date?: string;
  };
  is_flagged: boolean;
  flag_type: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

interface Therapist {
  id: string;
  first_name: string;
  last_name: string;
  profile_image: string | null;
}

export default function ScheduleAlerts() {
  const { t, i18n } = useTranslation("admin");
  const navigate = useNavigate();
  const isFr = i18n.language === "fr";
  const locale = isFr ? fr : enUS;

  const [alerts, setAlerts] = useState<AuditLogEntry[]>([]);
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [therapistFilter, setTherapistFilter] = useState("all");
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  const { headerRef, filtersRef, itemsPerPage } = useLayoutCalculation();
  const { toggleSort, getSortDirection, sortItems } = useTableSort<string>();

  const fetchAlerts = useCallback(async () => {
    try {
      let query = supabase
        .from("audit_log")
        .select("*")
        .eq("table_name", "therapist_availability")
        .order("changed_at", { ascending: false });

      if (statusFilter === "pending") {
        query = query.eq("is_flagged", true).is("acknowledged_at", null);
      } else if (statusFilter === "acknowledged") {
        query = query.not("acknowledged_at", "is", null);
      }

      if (sourceFilter !== "all") {
        query = query.eq("source", sourceFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setAlerts((data as AuditLogEntry[]) || []);
    } catch (error) {
      console.error("Error fetching alerts:", error);
      toast.error(isFr ? "Erreur de chargement" : "Loading error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sourceFilter, isFr]);

  const fetchTherapists = useCallback(async () => {
    const { data } = await supabase
      .from("therapists")
      .select("id, first_name, last_name, profile_image")
      .order("first_name");
    setTherapists(data || []);
  }, []);

  useEffect(() => {
    fetchAlerts();
    fetchTherapists();
  }, [fetchAlerts, fetchTherapists]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("audit-log-alerts")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "audit_log",
          filter: "table_name=eq.therapist_availability",
        },
        () => {
          fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAlerts]);

  const getTherapist = useCallback(
    (therapistId: string | undefined) => {
      if (!therapistId) return null;
      return therapists.find((t) => t.id === therapistId) || null;
    },
    [therapists]
  );

  // Filter by therapist and search
  const filteredAlerts = useMemo(() => {
    let result = [...alerts];

    if (therapistFilter !== "all") {
      result = result.filter(
        (a) => a.metadata?.therapist_id === therapistFilter
      );
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((a) => {
        const therapist = getTherapist(a.metadata?.therapist_id);
        if (!therapist) return false;
        return (
          therapist.first_name.toLowerCase().includes(query) ||
          therapist.last_name.toLowerCase().includes(query)
        );
      });
    }

    return result;
  }, [alerts, therapistFilter, searchQuery, getTherapist]);

  const sortedAlerts = useMemo(() => {
    return sortItems(filteredAlerts, (alert, column) => {
      switch (column) {
        case "therapist": {
          const th = getTherapist(alert.metadata?.therapist_id);
          return th ? `${th.first_name} ${th.last_name}` : "";
        }
        case "affectedDate":
          return alert.metadata?.affected_date || "";
        case "changedAt":
          return alert.changed_at;
        case "source":
          return alert.source;
        case "status":
          return alert.acknowledged_at ? "1" : "0";
        default:
          return null;
      }
    });
  }, [filteredAlerts, sortItems, getTherapist]);

  const {
    currentPage,
    setCurrentPage,
    totalPages,
    paginatedItems: paginatedAlerts,
    needsPagination,
  } = usePagination({ items: sortedAlerts, itemsPerPage });

  useOverflowControl(!loading && needsPagination);

  const handleAcknowledge = async (alertId: string) => {
    setAcknowledging(alertId);
    const { error } = await supabase.rpc("acknowledge_audit_alert", {
      _alert_id: alertId,
    });
    setAcknowledging(null);

    if (error) {
      toast.error(isFr ? "Erreur" : "Error");
      return;
    }

    toast.success(t("scheduleAlerts.acknowledgedSuccess"));
    fetchAlerts();
  };

  const handleAcknowledgeAll = async () => {
    const pendingIds = filteredAlerts
      .filter((a) => a.is_flagged && !a.acknowledged_at)
      .map((a) => a.id);

    if (pendingIds.length === 0) return;

    const { data, error } = await supabase.rpc(
      "acknowledge_audit_alerts_bulk",
      { _alert_ids: pendingIds }
    );

    if (error) {
      toast.error(isFr ? "Erreur" : "Error");
      return;
    }

    toast.success(t("scheduleAlerts.acknowledgedAllSuccess", { count: data }));
    fetchAlerts();
  };

  const pendingCount = filteredAlerts.filter(
    (a) => a.is_flagged && !a.acknowledged_at
  ).length;

  const SourceIcon = ({ source }: { source: string }) => {
    if (source === "pwa") return <Smartphone className="h-3 w-3" />;
    if (source === "admin") return <Shield className="h-3 w-3" />;
    return null;
  };

  return (
    <div
      className={cn(
        "bg-background flex flex-col",
        needsPagination ? "h-screen overflow-hidden" : "min-h-0"
      )}
    >
      <div
        className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6"
        ref={headerRef}
      >
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            {t("scheduleAlerts.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("scheduleAlerts.subtitle")}
          </p>
        </div>
      </div>

      <div
        className={cn(
          "flex-1 px-4 md:px-6 pb-4 md:pb-6",
          needsPagination ? "overflow-hidden" : ""
        )}
      >
        <div
          className={cn(
            "bg-card rounded-lg border border-border flex flex-col",
            needsPagination ? "h-full" : ""
          )}
        >
          <div
            ref={filtersRef}
            className="p-4 border-b border-border flex flex-wrap gap-4 items-center flex-shrink-0"
          >
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={isFr ? "Rechercher" : "Search"}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">
                  {t("scheduleAlerts.filters.pending")}
                </SelectItem>
                <SelectItem value="acknowledged">
                  {t("scheduleAlerts.filters.acknowledged")}
                </SelectItem>
                <SelectItem value="all">
                  {t("scheduleAlerts.filters.all")}
                </SelectItem>
              </SelectContent>
            </Select>

            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("scheduleAlerts.allSources")}
                </SelectItem>
                <SelectItem value="pwa">
                  {t("scheduleAlerts.sources.pwa")}
                </SelectItem>
                <SelectItem value="admin">
                  {t("scheduleAlerts.sources.admin")}
                </SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={therapistFilter}
              onValueChange={setTherapistFilter}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("scheduleAlerts.allTherapists")}
                </SelectItem>
                {therapists.map((th) => (
                  <SelectItem key={th.id} value={th.id}>
                    {th.first_name} {th.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {pendingCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={handleAcknowledgeAll}
              >
                <CheckCheck className="h-4 w-4 mr-2" />
                {t("scheduleAlerts.actions.acknowledgeAll")} ({pendingCount})
              </Button>
            )}
          </div>

          <div
            className={cn(
              "flex-1",
              needsPagination ? "min-h-0 overflow-hidden" : ""
            )}
          >
            <div className="overflow-x-auto h-full">
              <Table className="text-xs w-full min-w-[800px]">
                <TableHeader>
                  <TableRow className="bg-muted/20 h-8">
                    <SortableTableHead
                      column="therapist"
                      sortDirection={getSortDirection("therapist")}
                      onSort={toggleSort}
                    >
                      {t("scheduleAlerts.columns.therapist")}
                    </SortableTableHead>
                    <SortableTableHead
                      column="affectedDate"
                      sortDirection={getSortDirection("affectedDate")}
                      onSort={toggleSort}
                    >
                      {t("scheduleAlerts.columns.affectedDate")}
                    </SortableTableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2">
                      {t("scheduleAlerts.columns.changeType")}
                    </TableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2">
                      {t("scheduleAlerts.columns.summary")}
                    </TableHead>
                    <SortableTableHead
                      column="source"
                      sortDirection={getSortDirection("source")}
                      onSort={toggleSort}
                    >
                      {t("scheduleAlerts.columns.source")}
                    </SortableTableHead>
                    <SortableTableHead
                      column="changedAt"
                      sortDirection={getSortDirection("changedAt")}
                      onSort={toggleSort}
                    >
                      {t("scheduleAlerts.columns.changedAt")}
                    </SortableTableHead>
                    <SortableTableHead
                      column="status"
                      sortDirection={getSortDirection("status")}
                      onSort={toggleSort}
                    >
                      {t("scheduleAlerts.columns.status")}
                    </SortableTableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 text-right">
                      {t("scheduleAlerts.columns.actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                {loading ? (
                  <TableSkeleton rows={itemsPerPage} columns={8} />
                ) : paginatedAlerts.length === 0 ? (
                  <TableEmptyState
                    colSpan={8}
                    icon={Flag}
                    message={t("scheduleAlerts.noAlerts")}
                    description={t("scheduleAlerts.noAlertsDesc")}
                  />
                ) : (
                  <TableBody>
                    {paginatedAlerts.map((alert) => {
                      const therapist = getTherapist(
                        alert.metadata?.therapist_id
                      );
                      const isPending =
                        alert.is_flagged && !alert.acknowledged_at;

                      return (
                        <TableRow
                          key={alert.id}
                          className="hover:bg-muted/50 transition-colors"
                        >
                          {/* Therapist */}
                          <TableCell className="py-0 px-2">
                            {therapist ? (
                              <PersonCell person={therapist} />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>

                          {/* Affected Date */}
                          <TableCell className="py-0 px-2">
                            <span className="text-foreground">
                              {alert.metadata?.affected_date
                                ? format(
                                    new Date(
                                      alert.metadata.affected_date +
                                        "T00:00:00"
                                    ),
                                    "EEE d MMM",
                                    { locale }
                                  )
                                : "—"}
                            </span>
                          </TableCell>

                          {/* Change Type */}
                          <TableCell className="py-0 px-2">
                            <Badge
                              variant={
                                alert.change_type === "delete"
                                  ? "destructive"
                                  : "secondary"
                              }
                              className="text-[10px] px-1.5 py-0"
                            >
                              {t(
                                `scheduleAlerts.changeTypes.${alert.change_type}`
                              )}
                            </Badge>
                          </TableCell>

                          {/* Summary: before → after */}
                          <TableCell className="py-1 px-2">
                            <div className="flex flex-col gap-0.5 text-foreground">
                              <span className="text-[11px]">
                                {describeScheduleChange(
                                  alert.old_values,
                                  alert.new_values,
                                  alert.change_type,
                                  t
                                )}
                              </span>
                              {alert.old_values && (
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                  <span className="line-through">
                                    {alert.old_values.is_available
                                      ? formatShiftsSummary(alert.old_values.shifts)
                                      : (isFr ? "Indisponible" : "Unavailable")}
                                  </span>
                                  <span>→</span>
                                  <span className="text-foreground font-medium">
                                    {alert.new_values
                                      ? alert.new_values.is_available
                                        ? formatShiftsSummary(alert.new_values.shifts)
                                        : (isFr ? "Indisponible" : "Unavailable")
                                      : (isFr ? "Supprimé" : "Deleted")}
                                  </span>
                                </div>
                              )}
                              {!alert.old_values && alert.new_values && (
                                <span className="text-[10px] text-muted-foreground">
                                  {alert.new_values.is_available
                                    ? formatShiftsSummary(alert.new_values.shifts)
                                    : (isFr ? "Indisponible" : "Unavailable")}
                                </span>
                              )}
                            </div>
                          </TableCell>

                          {/* Source */}
                          <TableCell className="py-0 px-2">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <SourceIcon source={alert.source} />
                              <span className="text-foreground">
                                {t(
                                  `scheduleAlerts.sources.${alert.source}`
                                )}
                              </span>
                            </div>
                          </TableCell>

                          {/* Changed At */}
                          <TableCell className="py-0 px-2">
                            <span
                              className="text-muted-foreground"
                              title={format(
                                new Date(alert.changed_at),
                                "PPpp",
                                { locale }
                              )}
                            >
                              {formatDistanceToNow(
                                new Date(alert.changed_at),
                                { addSuffix: true, locale }
                              )}
                            </span>
                          </TableCell>

                          {/* Status */}
                          <TableCell className="py-0 px-2">
                            {isPending ? (
                              <Badge
                                variant="destructive"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {t("scheduleAlerts.status.pending")}
                              </Badge>
                            ) : (
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                              >
                                {t("scheduleAlerts.status.acknowledged")}
                              </Badge>
                            )}
                          </TableCell>

                          {/* Actions */}
                          <TableCell className="py-0 px-2">
                            <div className="flex items-center justify-end gap-1">
                              {isPending && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  disabled={acknowledging === alert.id}
                                  onClick={() => handleAcknowledge(alert.id)}
                                  title={t(
                                    "scheduleAlerts.actions.acknowledge"
                                  )}
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                              )}
                              {alert.metadata?.therapist_id && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() =>
                                    navigate(
                                      `/admin/therapists/${alert.metadata.therapist_id}`
                                    )
                                  }
                                  title={t(
                                    "scheduleAlerts.actions.viewSchedule"
                                  )}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                )}
              </Table>
            </div>
          </div>

          {needsPagination && (
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredAlerts.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              itemName={isFr ? "alertes" : "alerts"}
            />
          )}
        </div>
      </div>
    </div>
  );
}
