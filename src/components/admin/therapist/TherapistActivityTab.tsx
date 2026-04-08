import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
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
  Flag,
  Check,
  CheckCheck,
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
import { TablePagination } from "@/components/table/TablePagination";
import { TableSkeleton } from "@/components/table/TableSkeleton";
import { TableEmptyState } from "@/components/table/TableEmptyState";
import { SortableTableHead } from "@/components/table/SortableTableHead";
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

interface TherapistActivityTabProps {
  therapistId: string;
}

const ITEMS_PER_PAGE = 15;

export function TherapistActivityTab({ therapistId }: TherapistActivityTabProps) {
  const { t, i18n } = useTranslation("admin");
  const isFr = i18n.language === "fr";
  const locale = isFr ? fr : enUS;

  const [alerts, setAlerts] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  const { toggleSort, getSortDirection, sortItems } = useTableSort<string>();

  const fetchAlerts = useCallback(async () => {
    try {
      let query = supabase
        .from("audit_log")
        .select("*")
        .eq("table_name", "therapist_availability")
        .eq("metadata->>therapist_id", therapistId)
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
      console.error("Error fetching therapist activity:", error);
      toast.error(isFr ? "Erreur de chargement" : "Loading error");
    } finally {
      setLoading(false);
    }
  }, [therapistId, statusFilter, sourceFilter, isFr]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`audit-log-therapist-${therapistId}`)
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
  }, [fetchAlerts, therapistId]);

  const sortedAlerts = useMemo(() => {
    return sortItems(alerts, (alert, column) => {
      switch (column) {
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
  }, [alerts, sortItems]);

  const {
    currentPage,
    setCurrentPage,
    totalPages,
    paginatedItems: paginatedAlerts,
    needsPagination,
  } = usePagination({ items: sortedAlerts, itemsPerPage: ITEMS_PER_PAGE });

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
    const pendingIds = alerts
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

  const pendingCount = alerts.filter(
    (a) => a.is_flagged && !a.acknowledged_at
  ).length;

  const SourceIcon = ({ source }: { source: string }) => {
    if (source === "pwa") return <Smartphone className="h-3 w-3" />;
    if (source === "admin") return <Shield className="h-3 w-3" />;
    return null;
  };

  return (
    <div className="bg-card rounded-lg border border-border flex flex-col">
      <div className="p-4 border-b border-border flex flex-wrap gap-4 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("scheduleAlerts.filters.all")}
            </SelectItem>
            <SelectItem value="pending">
              {t("scheduleAlerts.filters.pending")}
            </SelectItem>
            <SelectItem value="acknowledged">
              {t("scheduleAlerts.filters.acknowledged")}
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

      <div className="overflow-x-auto">
        <Table className="text-xs w-full min-w-[700px]">
          <TableHeader>
            <TableRow className="bg-muted/20 h-8">
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
            <TableSkeleton rows={ITEMS_PER_PAGE} columns={7} />
          ) : paginatedAlerts.length === 0 ? (
            <TableEmptyState
              colSpan={7}
              icon={Flag}
              message={t("therapists.activityTab.noActivity")}
              description={t("therapists.activityTab.noActivityDesc")}
            />
          ) : (
            <TableBody>
              {paginatedAlerts.map((alert) => {
                const isPending =
                  alert.is_flagged && !alert.acknowledged_at;

                return (
                  <TableRow
                    key={alert.id}
                    className="hover:bg-muted/50 transition-colors"
                  >
                    {/* Affected Date */}
                    <TableCell className="py-0 px-2">
                      <span className="text-foreground">
                        {alert.metadata?.affected_date
                          ? format(
                              new Date(
                                alert.metadata.affected_date + "T00:00:00"
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
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          )}
        </Table>
      </div>

      {needsPagination && (
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={alerts.length}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={setCurrentPage}
          itemName={isFr ? "activités" : "activities"}
        />
      )}
    </div>
  );
}
