import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
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
import { Search, Plus, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { TablePagination } from "@/components/table/TablePagination";
import { TableSkeleton } from "@/components/table/TableSkeleton";
import { TableEmptyState } from "@/components/table/TableEmptyState";
import { SortableTableHead } from "@/components/table/SortableTableHead";
import { useLayoutCalculation } from "@/hooks/useLayoutCalculation";
import { useOverflowControl } from "@/hooks/useOverflowControl";
import { usePagination } from "@/hooks/usePagination";
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
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [userRole, setUserRole] = useState<string | null>(null);

  const { headerRef, filtersRef, itemsPerPage } = useLayoutCalculation();
  const { deleteId: deleteCustomerId, openDelete, closeDelete } = useDialogState<string>();
  const { toggleSort, getSortDirection, sortItems } = useTableSort<string>();

  useEffect(() => {
    fetchCustomers();
    fetchUserRole();
  }, []);

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

  useEffect(() => {
    filterCustomers();
  }, [searchQuery, languageFilter, customers]);

  const fetchCustomers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select(`
        *,
        preferred_therapist:therapists!customers_preferred_therapist_id_fkey(
          id, first_name, last_name
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(t("customers.noCustomers"));
      setLoading(false);
      return;
    }

    setCustomers(data || []);
    setLoading(false);
  };

  const filterCustomers = () => {
    let filtered = customers;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.first_name.toLowerCase().includes(q) ||
          (c.last_name && c.last_name.toLowerCase().includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          c.phone.includes(searchQuery)
      );
    }

    if (languageFilter !== "all") {
      filtered = filtered.filter((c) => c.language === languageFilter);
    }

    setFilteredCustomers(filtered);
  };

  const sortedCustomers = useMemo(() => {
    return sortItems(filteredCustomers, (customer, column) => {
      switch (column) {
        case "name": return `${customer.first_name} ${customer.last_name || ""}`;
        case "email": return customer.email || "";
        case "created_at": return customer.created_at;
        default: return null;
      }
    });
  }, [filteredCustomers, sortItems]);

  const { currentPage, setCurrentPage, totalPages, paginatedItems: paginatedCustomers, needsPagination } = usePagination({
    items: sortedCustomers,
    itemsPerPage,
  });

  useOverflowControl(!loading && needsPagination);

  const columnCount = isAdmin ? 7 : 6;

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
    fetchCustomers();
  };

  return (
    <div className={cn("bg-background flex flex-col", needsPagination ? "h-screen overflow-hidden" : "min-h-0")}>
      <div className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6" ref={headerRef}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">{t("customers.title")}</h1>
            <p className="text-muted-foreground mt-1">
              {t("customers.description")}
            </p>
          </div>
          {isAdmin && (
            <Button
              className="bg-foreground text-background hover:bg-foreground/90 flex-shrink-0"
              onClick={() => navigate("/admin/customers/new")}
            >
              <Plus className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">{t("customers.add")}</span>
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
              <Table className="text-xs w-full table-fixed min-w-[800px]">
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
              totalItems={filteredCustomers.length}
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
