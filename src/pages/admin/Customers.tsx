import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useOrgScope } from "@/hooks/useOrgScope";
import { listCustomersPageForOrg, type CustomerListSortColumn } from "@shared/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { TablePagination } from "@/components/table/TablePagination";
import { TableSkeleton } from "@/components/table/TableSkeleton";
import { TableEmptyState } from "@/components/table/TableEmptyState";
import { SortableTableHead } from "@/components/table/SortableTableHead";
import { useLayoutCalculation } from "@/hooks/useLayoutCalculation";
import { useOverflowControl } from "@/hooks/useOverflowControl";
import { useDialogState } from "@/hooks/useDialogState";
import { useTableSort } from "@/hooks/useTableSort";
import { format } from "date-fns";

interface Customer {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string;
  email: string | null;
  language: string | null;
  preferred_therapist_id: string | null;
  preferred_treatment_type: string | null;
  health_notes: string | null;
  created_at: string;
  booking_count: number;
  preferred_therapist?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}

export default function Customers() {
  const navigate = useNavigate();
  const { t } = useTranslation("admin");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [userRole, setUserRole] = useState<string | null>(null);

  const { headerRef, filtersRef, itemsPerPage } = useLayoutCalculation();
  const { deleteId: deleteCustomerId, openDelete, closeDelete } = useDialogState<string>();
  const { sortConfig, toggleSort, getSortDirection } = useTableSort<string>();

  const scope = useOrgScope();

  useEffect(() => {
    fetchUserRole();
  }, []);

  // Debounce la saisie avant de déclencher la recherche serveur.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Retour page 1 quand la recherche, le filtre ou le tri change.
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, languageFilter, sortConfig]);

  useEffect(() => {
    if (!scope || itemsPerPage <= 0) return;
    let cancelled = false;
    setLoading(true);

    const serverSortColumns: CustomerListSortColumn[] = ["name", "email", "created_at"];
    const sort =
      sortConfig.column && serverSortColumns.includes(sortConfig.column as CustomerListSortColumn)
        ? {
            column: sortConfig.column as CustomerListSortColumn,
            direction: sortConfig.direction,
          }
        : undefined;

    listCustomersPageForOrg(supabase, scope, {
      search: debouncedSearch,
      language: languageFilter === "all" ? undefined : languageFilter,
      page: currentPage,
      pageSize: itemsPerPage,
      sort,
    })
      .then((result) => {
        if (cancelled) return;
        setCustomers(result.customers as unknown as Customer[]);
        setTotal(result.total);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("customers.noCustomers"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scope, debouncedSearch, languageFilter, currentPage, itemsPerPage, sortConfig, reloadKey, t]);

  const fetchUserRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!error && data) {
      setUserRole(data.role);
    }
  };

  const isAdmin = userRole === "admin";

  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, itemsPerPage)));
  const needsPagination = total > itemsPerPage;
  const paginatedCustomers = customers;

  useOverflowControl(!loading && needsPagination);

  const columnCount = isAdmin ? 8 : 7;

  const handleDelete = async () => {
    if (!deleteCustomerId) return;

    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", deleteCustomerId);

    if (error) {
      if (error.code === "23503") {
        toast.error(t("customers.deleteHasBookings"));
      } else {
        toast.error(t("common.confirmDelete"));
      }
      return;
    }

    toast.success(t("customers.deleteSuccess"));
    closeDelete();
    setReloadKey((k) => k + 1);
  };

  return (
    <div className={cn("bg-background flex flex-col", needsPagination ? "h-screen overflow-hidden" : "min-h-0")}>
      <div className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6" ref={headerRef}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-medium tracking-tight">{t("customers.title")}</h1>
            <p className="text-muted-foreground mt-1">
              {t("customers.description")}
            </p>
          </div>
          {isAdmin && (
            <Button
              className="flex-shrink-0"
              onClick={() => navigate("/admin/customers/new")}
            >
              {t("customers.add")}
            </Button>
          )}
        </div>
      </div>

      <div className={cn("flex-1 px-4 md:px-6 pb-4 md:pb-6", needsPagination ? "overflow-hidden" : "")}>
        <div className={cn("bg-card rounded-lg border border-border flex flex-col", needsPagination ? "h-full" : "")}>
          <div ref={filtersRef} className="p-4 border-b border-border flex flex-wrap gap-4 items-center flex-shrink-0">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder={t("customers.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={languageFilter} onValueChange={setLanguageFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("customers.allLanguages")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("customers.allLanguages")}</SelectItem>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className={cn("flex-1", needsPagination ? "min-h-0 overflow-hidden" : "")}>
            <div className="overflow-x-auto h-full">
              <Table className="text-sm w-full table-fixed min-w-[800px]">
                <TableHeader>
                  <TableRow className="bg-muted/20 h-8">
                    <SortableTableHead column="name" sortDirection={getSortDirection("name")} onSort={toggleSort}>
                      {t("customers.columns.name")}
                    </SortableTableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">
                      {t("customers.columns.phone")}
                    </TableHead>
                    <SortableTableHead column="email" sortDirection={getSortDirection("email")} onSort={toggleSort}>
                      {t("customers.columns.email")}
                    </SortableTableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate w-[80px]">
                      {t("customers.columns.language")}
                    </TableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">
                      {t("customers.columns.preferredTherapist")}
                    </TableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate text-right w-[90px]">
                      {t("customers.columns.bookings")}
                    </TableHead>
                    <SortableTableHead column="created_at" sortDirection={getSortDirection("created_at")} onSort={toggleSort}>
                      {t("customers.columns.createdAt")}
                    </SortableTableHead>
                    {isAdmin && (
                      <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate text-right w-[80px]">
                        {t("common.actions")}
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                {loading ? (
                  <TableSkeleton rows={itemsPerPage} columns={columnCount} />
                ) : paginatedCustomers.length === 0 ? (
                  <TableEmptyState
                    colSpan={columnCount}
                    icon={Users}
                    message={t("customers.noCustomers")}
                    description={searchQuery || languageFilter !== "all" ? t("customers.noCustomersDescription") : undefined}
                    actionLabel={isAdmin ? t("customers.add") : undefined}
                    onAction={isAdmin ? () => navigate("/admin/customers/new") : undefined}
                  />
                ) : (
                  <TableBody>
                    {paginatedCustomers.map((customer) => (
                      <TableRow
                        key={customer.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors h-10 max-h-10"
                        onClick={() => navigate(`/admin/customers/${customer.id}`)}
                      >
                        <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                          <span className="truncate block text-foreground font-medium">
                            {customer.first_name} {customer.last_name || ""}
                          </span>
                        </TableCell>
                        <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                          <span className="truncate block text-foreground">{customer.phone}</span>
                        </TableCell>
                        <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                          <span className="truncate block text-foreground">{customer.email || "-"}</span>
                        </TableCell>
                        <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                          {customer.language ? (
                            <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                              {customer.language.toUpperCase()}
                            </Badge>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                          <span className="truncate block text-foreground">
                            {customer.preferred_therapist
                              ? `${customer.preferred_therapist.first_name} ${customer.preferred_therapist.last_name}`
                              : "-"}
                          </span>
                        </TableCell>
                        <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden text-right">
                          <span className="block text-foreground tabular-nums">
                            {customer.booking_count}
                          </span>
                        </TableCell>
                        <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                          <span className="truncate block text-foreground">
                            {format(new Date(customer.created_at), "dd/MM/yyyy")}
                          </span>
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/admin/customers/${customer.id}`);
                                }}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDelete(customer.id);
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
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
              totalItems={total}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              itemName="clients"
            />
          )}
        </div>
      </div>

      <AlertDialog open={!!deleteCustomerId} onOpenChange={(open) => !open && closeDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("customers.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("customers.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
