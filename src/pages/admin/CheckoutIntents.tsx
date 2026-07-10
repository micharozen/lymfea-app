import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Eye, ExternalLink, Search, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useOrgScope, orgScopeKey } from "@/hooks/useOrgScope";
import {
  checkoutIntentKeys,
  fetchReminderAuditIds,
  hotelKeys,
  listCheckoutIntentsForOrg,
  listHotelsForOrgDropdown,
  parseCartSnapshot,
  type CheckoutIntentRow,
} from "@shared/db";
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
import { TablePagination } from "@/components/table/TablePagination";
import { TableSkeleton } from "@/components/table/TableSkeleton";
import { TableEmptyState } from "@/components/table/TableEmptyState";
import { SortableTableHead } from "@/components/table/SortableTableHead";
import { EmailPreviewDialog } from "@/components/admin/booking/EmailPreviewDialog";
import { CartSnapshotDialog } from "@/components/admin/checkout-intents/CartSnapshotDialog";
import { CheckoutIntentsStats } from "@/components/admin/checkout-intents/CheckoutIntentsStats";
import { useLayoutCalculation } from "@/hooks/useLayoutCalculation";
import { useOverflowControl } from "@/hooks/useOverflowControl";
import { usePagination } from "@/hooks/usePagination";
import { useTableSort } from "@/hooks/useTableSort";
import { currencySymbol, formatIntentPrice, formatIntentSlot } from "@/lib/admin/checkoutIntentFormat";

type StatusFilter = "all" | "converted" | "abandoned" | "not_reminded";
const PERIODS = [7, 30, 90] as const;
const COLUMN_COUNT = 8;

export default function CheckoutIntents() {
  const { t } = useTranslation("admin");
  const navigate = useNavigate();
  const scope = useOrgScope();

  const [searchQuery, setSearchQuery] = useState("");
  const [venueFilter, setVenueFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [periodDays, setPeriodDays] = useState<number | null>(30);
  const [cartIntent, setCartIntent] = useState<CheckoutIntentRow | null>(null);
  const [previewAuditId, setPreviewAuditId] = useState<string | null>(null);

  const { headerRef, filtersRef, itemsPerPage } = useLayoutCalculation();
  const { toggleSort, getSortDirection, sortItems } = useTableSort<string>();

  const { data: intents = [], isLoading } = useQuery({
    queryKey: checkoutIntentKeys.list(orgScopeKey(scope), periodDays),
    queryFn: () => listCheckoutIntentsForOrg(supabase, scope!, { sinceDays: periodDays ?? undefined }),
    enabled: !!scope,
  });

  const { data: venues = [] } = useQuery({
    queryKey: hotelKeys.dropdown(scope),
    queryFn: () => listHotelsForOrgDropdown(supabase, scope!),
    enabled: !!scope,
  });

  const remindedIds = useMemo(
    () => intents.filter((i) => i.reminder_count > 0).map((i) => i.id),
    [intents],
  );

  const { data: auditIdByIntent = {} } = useQuery({
    queryKey: [...checkoutIntentKeys.all, "audit", remindedIds],
    queryFn: () => fetchReminderAuditIds(supabase, remindedIds),
    enabled: remindedIds.length > 0,
  });

  const filteredIntents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return intents.filter((intent) => {
      if (venueFilter !== "all" && intent.hotel_id !== venueFilter) return false;

      if (statusFilter === "converted" && !intent.converted_at) return false;
      if (statusFilter === "abandoned" && intent.converted_at) return false;
      if (statusFilter === "not_reminded" && (intent.converted_at || intent.reminder_count > 0)) return false;

      if (!query) return true;
      const haystack = [intent.client_first_name, intent.client_last_name, intent.client_email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [intents, searchQuery, venueFilter, statusFilter]);

  const kpis = useMemo(() => {
    const total = filteredIntents.length;
    const converted = filteredIntents.filter((i) => i.converted_at).length;
    const abandoned = total - converted;
    const reminded = filteredIntents.filter((i) => i.reminder_count > 0).length;

    const abandonedValue = filteredIntents
      .filter((i) => !i.converted_at)
      .reduce((sum, i) => sum + (parseCartSnapshot(i.cart_snapshot).total ?? 0), 0);

    const currency = filteredIntents.length
      ? parseCartSnapshot(filteredIntents[0].cart_snapshot).currency
      : "EUR";

    return {
      total,
      converted,
      abandoned,
      reminded,
      conversionRate: total ? Math.round((converted / total) * 100) : 0,
      abandonedValue: `${Math.round(abandonedValue)}${currencySymbol(currency)}`,
    };
  }, [filteredIntents]);

  const sortedIntents = useMemo(
    () =>
      sortItems(filteredIntents, (intent, column) => {
        switch (column) {
          case "client": return `${intent.client_first_name} ${intent.client_last_name ?? ""}`;
          case "venue": return intent.hotels?.name ?? "";
          case "cart": return parseCartSnapshot(intent.cart_snapshot).total ?? 0;
          case "created_at": return intent.created_at;
          case "reminder": return intent.reminder_sent_at ?? "";
          default: return null;
        }
      }),
    [filteredIntents, sortItems],
  );

  const { currentPage, setCurrentPage, totalPages, paginatedItems, needsPagination } = usePagination({
    items: sortedIntents,
    itemsPerPage,
  });

  useOverflowControl(!isLoading && needsPagination);

  const hasFilters = !!searchQuery || venueFilter !== "all" || statusFilter !== "all";

  return (
    <div className={cn("bg-background flex flex-col", needsPagination ? "h-screen overflow-hidden" : "min-h-0")}>
      <div className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6" ref={headerRef}>
        <div className="mb-4">
          <h1 className="text-lg font-medium tracking-tight">{t("checkoutIntents.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("checkoutIntents.description")}</p>
        </div>

        <div className="mb-4">
          <CheckoutIntentsStats kpis={kpis} />
        </div>
      </div>

      <div className={cn("flex-1 px-4 md:px-6 pb-4 md:pb-6", needsPagination ? "overflow-hidden" : "")}>
        <div className={cn("bg-card rounded-lg border border-border flex flex-col", needsPagination ? "h-full" : "")}>
          <div ref={filtersRef} className="p-4 border-b border-border flex flex-wrap gap-4 items-center flex-shrink-0">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder={t("checkoutIntents.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={venueFilter} onValueChange={setVenueFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t("checkoutIntents.filters.allVenues")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("checkoutIntents.filters.allVenues")}</SelectItem>
                {venues.map((venue) => (
                  <SelectItem key={venue.id} value={venue.id}>
                    {venue.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("checkoutIntents.filters.allStatuses")}</SelectItem>
                <SelectItem value="converted">{t("checkoutIntents.status.converted")}</SelectItem>
                <SelectItem value="abandoned">{t("checkoutIntents.status.abandoned")}</SelectItem>
                <SelectItem value="not_reminded">{t("checkoutIntents.filters.notReminded")}</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={periodDays === null ? "all" : String(periodDays)}
              onValueChange={(v) => setPeriodDays(v === "all" ? null : Number(v))}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((days) => (
                  <SelectItem key={days} value={String(days)}>
                    {t("checkoutIntents.filters.lastDays", { count: days })}
                  </SelectItem>
                ))}
                <SelectItem value="all">{t("checkoutIntents.filters.allTime")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className={cn("flex-1", needsPagination ? "min-h-0 overflow-hidden" : "")}>
            <div className="overflow-x-auto h-full">
              <Table className="text-sm w-full table-fixed min-w-[900px]">
                <TableHeader>
                  <TableRow className="bg-muted/20 h-8">
                    <SortableTableHead column="client" sortDirection={getSortDirection("client")} onSort={toggleSort}>
                      {t("checkoutIntents.columns.client")}
                    </SortableTableHead>
                    <SortableTableHead column="venue" sortDirection={getSortDirection("venue")} onSort={toggleSort}>
                      {t("checkoutIntents.columns.venue")}
                    </SortableTableHead>
                    <SortableTableHead column="cart" sortDirection={getSortDirection("cart")} onSort={toggleSort}>
                      {t("checkoutIntents.columns.cart")}
                    </SortableTableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">
                      {t("checkoutIntents.columns.slot")}
                    </TableHead>
                    <SortableTableHead column="created_at" sortDirection={getSortDirection("created_at")} onSort={toggleSort}>
                      {t("checkoutIntents.columns.createdAt")}
                    </SortableTableHead>
                    <SortableTableHead column="reminder" sortDirection={getSortDirection("reminder")} onSort={toggleSort}>
                      {t("checkoutIntents.columns.reminder")}
                    </SortableTableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate w-[110px]">
                      {t("checkoutIntents.columns.status")}
                    </TableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate text-right w-[90px]">
                      {t("common.actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>

                {isLoading ? (
                  <TableSkeleton rows={itemsPerPage} columns={COLUMN_COUNT} />
                ) : paginatedItems.length === 0 ? (
                  <TableEmptyState
                    colSpan={COLUMN_COUNT}
                    icon={ShoppingCart}
                    message={t("checkoutIntents.noIntents")}
                    description={hasFilters ? t("checkoutIntents.noIntentsDescription") : undefined}
                  />
                ) : (
                  <TableBody>
                    {paginatedItems.map((intent) => {
                      const cart = parseCartSnapshot(intent.cart_snapshot);
                      const auditId = auditIdByIntent[intent.id];

                      return (
                        <TableRow
                          key={intent.id}
                          className="cursor-pointer hover:bg-muted/50 transition-colors h-10 max-h-10"
                          onClick={() => setCartIntent(intent)}
                        >
                          <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                            <span className="truncate block text-foreground font-medium">
                              {intent.client_first_name} {intent.client_last_name ?? ""}
                            </span>
                            <span className="truncate block text-xs text-muted-foreground">
                              {intent.client_email}
                            </span>
                          </TableCell>
                          <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                            <span className="truncate block text-foreground">{intent.hotels?.name ?? "-"}</span>
                          </TableCell>
                          <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                            <span className="truncate block text-foreground">
                              {t("checkoutIntents.cartSummary", { count: cart.itemCount })}
                              {cart.total != null && ` · ${formatIntentPrice(cart.total, cart.currency)}`}
                            </span>
                          </TableCell>
                          <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                            <span className="truncate block text-foreground">
                              {formatIntentSlot(intent.booking_date, intent.booking_time)}
                            </span>
                          </TableCell>
                          <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                            <span className="truncate block text-foreground">
                              {format(new Date(intent.created_at), "dd/MM/yyyy HH:mm")}
                            </span>
                          </TableCell>
                          <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                            <span className="truncate block text-foreground">
                              {intent.reminder_sent_at
                                ? `${format(new Date(intent.reminder_sent_at), "dd/MM/yyyy")}${intent.reminder_count > 1 ? ` ×${intent.reminder_count}` : ""}`
                                : t("checkoutIntents.neverReminded")}
                            </span>
                          </TableCell>
                          <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                            <Badge
                              variant={intent.converted_at ? "default" : "outline"}
                              className="text-[10px] px-2 py-0.5"
                            >
                              {intent.converted_at
                                ? t("checkoutIntents.status.converted")
                                : t("checkoutIntents.status.abandoned")}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                            <div className="flex items-center justify-end gap-1">
                              {auditId && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  title={t("checkoutIntents.actions.previewEmail")}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewAuditId(auditId);
                                  }}
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                              )}
                              {intent.booking_id && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  title={t("checkoutIntents.actions.openBooking")}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/admin/bookings/${intent.booking_id}`);
                                  }}
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
              totalItems={filteredIntents.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              itemName={t("checkoutIntents.itemName")}
            />
          )}
        </div>
      </div>

      <CartSnapshotDialog
        intent={cartIntent}
        open={!!cartIntent}
        onOpenChange={(open) => !open && setCartIntent(null)}
      />
      <EmailPreviewDialog
        auditId={previewAuditId}
        open={!!previewAuditId}
        onOpenChange={(open) => !open && setPreviewAuditId(null)}
      />
    </div>
  );
}
