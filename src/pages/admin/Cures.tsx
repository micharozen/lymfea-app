import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/formatPrice";
import { Search, Pencil, Trash2, Package, Plus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
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
import { HotelCell } from "@/components/table/EntityCell";
import { TablePagination } from "@/components/table/TablePagination";
import { TableSkeleton } from "@/components/table/TableSkeleton";
import { TableEmptyState } from "@/components/table/TableEmptyState";
import { SortableTableHead } from "@/components/table/SortableTableHead";
import { useLayoutCalculation } from "@/hooks/useLayoutCalculation";
import { useOverflowControl } from "@/hooks/useOverflowControl";
import { usePagination } from "@/hooks/usePagination";
import { useDialogState } from "@/hooks/useDialogState";
import { useTableSort } from "@/hooks/useTableSort";
import { SellBundleDialog } from "@/components/admin/SellBundleDialog";

interface TreatmentBundle {
  id: string;
  hotel_id: string;
  name: string;
  name_en: string | null;
  total_sessions: number;
  price: number;
  currency: string;
  validity_days: number | null;
  status: string;
  created_at: string;
}

interface CustomerBundle {
  id: string;
  bundle_id: string;
  customer_id: string;
  hotel_id: string;
  total_sessions: number;
  used_sessions: number;
  purchase_date: string;
  expires_at: string;
  status: string;
  payment_reference: string | null;
  notes: string | null;
  customers: { first_name: string; last_name: string | null } | null;
  treatment_bundles: { name: string } | null;
}

export default function Cures() {
  const navigate = useNavigate();
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("templates");
  const [searchQuery, setSearchQuery] = useState("");
  const [hotelFilter, setHotelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sellDialogOpen, setSellDialogOpen] = useState(false);

  const { headerRef, filtersRef, itemsPerPage } = useLayoutCalculation();
  const { deleteId, openDelete, closeDelete } = useDialogState<string>();
  const { toggleSort, getSortDirection, sortItems } = useTableSort<string>();

  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      if (data) setUserRole(data.role);
    };
    fetchUserRole();
  }, []);

  const isAdmin = userRole === "admin";

  // Fetch hotels
  const { data: hotels } = useQuery({
    queryKey: ["hotels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotels")
        .select("id, name, image")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch bundle templates
  const { data: templates, isLoading: templatesLoading, refetch: refetchTemplates } = useQuery({
    queryKey: ["treatment-bundles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatment_bundles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as TreatmentBundle[];
    },
  });

  // Fetch bundle items count per bundle
  const { data: bundleItemCounts } = useQuery({
    queryKey: ["treatment-bundle-item-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatment_bundle_items")
        .select("bundle_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const item of data) {
        counts[item.bundle_id] = (counts[item.bundle_id] || 0) + 1;
      }
      return counts;
    },
  });

  // Fetch sold bundles
  const { data: soldBundles, isLoading: soldLoading, refetch: refetchSold } = useQuery({
    queryKey: ["customer-treatment-bundles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_treatment_bundles")
        .select("*, customers(first_name, last_name), treatment_bundles(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CustomerBundle[];
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (bundleId: string) => {
      const { error } = await supabase
        .from("treatment_bundles")
        .delete()
        .eq("id", bundleId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Modele supprime avec succes");
      closeDelete();
      queryClient.invalidateQueries({ queryKey: ["treatment-bundles"] });
    },
    onError: () => {
      toast.error("Erreur lors de la suppression");
    },
  });

  const getHotelInfo = (hotelId: string | null) => {
    if (!hotelId || !hotels) return null;
    return hotels.find((h) => h.id === hotelId);
  };

  // Templates filtering
  const filteredTemplates = useMemo(() => {
    return (templates || []).filter((b) => {
      const matchesSearch = b.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesHotel = hotelFilter === "all" || b.hotel_id === hotelFilter;
      const matchesStatus = statusFilter === "all" || b.status === statusFilter;
      return matchesSearch && matchesHotel && matchesStatus;
    });
  }, [templates, searchQuery, hotelFilter, statusFilter]);

  const sortedTemplates = useMemo(() => {
    return sortItems(filteredTemplates, (item, column) => {
      switch (column) {
        case "name": return item.name;
        case "sessions": return item.total_sessions;
        case "price": return item.price;
        case "validity": return item.validity_days;
        case "status": return item.status;
        default: return null;
      }
    });
  }, [filteredTemplates, sortItems]);

  const templatesPagination = usePagination({ items: sortedTemplates, itemsPerPage });

  // Sold bundles filtering
  const filteredSold = useMemo(() => {
    return (soldBundles || []).filter((b) => {
      const clientName = `${b.customers?.first_name || ""} ${b.customers?.last_name || ""}`.toLowerCase();
      const bundleName = (b.treatment_bundles?.name || "").toLowerCase();
      const matchesSearch = clientName.includes(searchQuery.toLowerCase()) || bundleName.includes(searchQuery.toLowerCase());
      const matchesHotel = hotelFilter === "all" || b.hotel_id === hotelFilter;
      const matchesStatus = statusFilter === "all" || b.status === statusFilter;
      return matchesSearch && matchesHotel && matchesStatus;
    });
  }, [soldBundles, searchQuery, hotelFilter, statusFilter]);

  const soldPagination = usePagination({ items: filteredSold, itemsPerPage });

  const isLoading = activeTab === "templates" ? templatesLoading : soldLoading;
  const needsPagination = activeTab === "templates" ? templatesPagination.needsPagination : soldPagination.needsPagination;

  useOverflowControl(!isLoading && needsPagination);

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { className: string; label: string }> = {
      active: { className: "bg-green-500/10 text-green-700 hover:bg-green-500/20", label: t("cures.status.active") },
      inactive: { className: "bg-gray-500/10 text-gray-700 hover:bg-gray-500/20", label: status === "inactive" ? "Inactif" : status },
      completed: { className: "bg-blue-500/10 text-blue-700 hover:bg-blue-500/20", label: t("cures.status.completed") },
      expired: { className: "bg-orange-500/10 text-orange-700 hover:bg-orange-500/20", label: t("cures.status.expired") },
      cancelled: { className: "bg-red-500/10 text-red-700 hover:bg-red-500/20", label: t("cures.status.cancelled") },
    };
    const config = statusConfig[status] || { className: "", label: status };
    return (
      <Badge variant="secondary" className={cn("text-[10px] px-2 py-0.5", config.className)}>
        {config.label}
      </Badge>
    );
  };

  return (
    <div className={cn("bg-background flex flex-col", needsPagination ? "h-screen overflow-hidden" : "min-h-0")}>
      <div className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6" ref={headerRef}>
        <div className="mb-4 md:mb-6 flex items-center justify-between">
          <h1 className="text-lg font-medium text-foreground flex items-center gap-2">
            <Package className="h-5 w-5" />
            {t("cures.title")}
          </h1>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="outline" onClick={() => setSellDialogOpen(true)}>
                <ShoppingCart className="h-4 w-4 mr-2" />
                {t("cures.sellCure")}
              </Button>
            )}
            {isAdmin && (
              <Button onClick={() => navigate("/admin/cures/templates/new")}>
                <Plus className="h-4 w-4 mr-2" />
                {t("cures.createTemplate")}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className={cn("flex-1 px-4 md:px-6 pb-4 md:pb-6", needsPagination ? "overflow-hidden" : "")}>
        <div className={cn("bg-card rounded-lg border border-border flex flex-col", needsPagination ? "h-full" : "")}>
          {/* Tabs */}
          <div className="border-b border-border px-4 md:px-6 pt-3">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="bg-transparent rounded-none p-0 h-auto">
                <TabsTrigger
                  value="templates"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5 text-sm"
                >
                  {t("cures.templates")}
                </TabsTrigger>
                <TabsTrigger
                  value="sold"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5 text-sm"
                >
                  {t("cures.sold")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Filters */}
          <div ref={filtersRef} className="p-4 md:p-6 border-b border-border flex flex-wrap gap-3 md:gap-4 flex-shrink-0">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {isAdmin && (
              <Select value={hotelFilter} onValueChange={setHotelFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Tous les lieux" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les lieux</SelectItem>
                  {hotels?.map((hotel) => (
                    <SelectItem key={hotel.id} value={hotel.id}>
                      {hotel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tous les statuts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                {activeTab === "templates" ? (
                  <>
                    <SelectItem value="active">Actif</SelectItem>
                    <SelectItem value="inactive">Inactif</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="active">{t("cures.status.active")}</SelectItem>
                    <SelectItem value="completed">{t("cures.status.completed")}</SelectItem>
                    <SelectItem value="expired">{t("cures.status.expired")}</SelectItem>
                    <SelectItem value="cancelled">{t("cures.status.cancelled")}</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Table content */}
          <div className={cn("flex-1", needsPagination ? "min-h-0 overflow-hidden" : "")}>
            {activeTab === "templates" ? (
              <div className="overflow-x-auto h-full">
                <Table className="text-sm w-full table-fixed min-w-[700px]">
                  <TableHeader>
                    <TableRow className="bg-muted/20 h-8">
                      <SortableTableHead column="name" sortDirection={getSortDirection("name")} onSort={toggleSort} className="w-[180px]">
                        Nom
                      </SortableTableHead>
                      <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 w-[140px]">Lieu</TableHead>
                      <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 text-center w-[80px]">Soins</TableHead>
                      <SortableTableHead column="sessions" sortDirection={getSortDirection("sessions")} onSort={toggleSort} align="center" className="w-[80px]">
                        Seances
                      </SortableTableHead>
                      <SortableTableHead column="price" sortDirection={getSortDirection("price")} onSort={toggleSort} align="center" className="w-[80px]">
                        Prix
                      </SortableTableHead>
                      <SortableTableHead column="validity" sortDirection={getSortDirection("validity")} onSort={toggleSort} align="center" className="w-[80px]">
                        Validite
                      </SortableTableHead>
                      <SortableTableHead column="status" sortDirection={getSortDirection("status")} onSort={toggleSort} align="center" className="w-[80px]">
                        Statut
                      </SortableTableHead>
                      {isAdmin && <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 text-right w-[70px]">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  {templatesLoading ? (
                    <TableSkeleton rows={itemsPerPage} columns={isAdmin ? 8 : 7} />
                  ) : templatesPagination.paginatedItems.length === 0 ? (
                    <TableEmptyState
                      colSpan={isAdmin ? 8 : 7}
                      icon={Package}
                      message="Aucun modele de cure"
                      actionLabel={isAdmin ? t("cures.createTemplate") : undefined}
                      onAction={isAdmin ? () => navigate("/admin/cures/templates/new") : undefined}
                    />
                  ) : (
                    <TableBody>
                      {templatesPagination.paginatedItems.map((bundle) => {
                        const hotel = getHotelInfo(bundle.hotel_id);
                        return (
                          <TableRow
                            key={bundle.id}
                            className="cursor-pointer hover:bg-muted/50 transition-colors h-10 max-h-10"
                            onClick={() => navigate(`/admin/cures/templates/${bundle.id}`)}
                          >
                            <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                              <span className="truncate font-medium text-foreground">{bundle.name}</span>
                            </TableCell>
                            <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                              <HotelCell hotel={hotel} />
                            </TableCell>
                            <TableCell className="py-0 px-2 h-10 max-h-10 text-center text-foreground">
                              {bundleItemCounts?.[bundle.id] || 0}
                            </TableCell>
                            <TableCell className="py-0 px-2 h-10 max-h-10 text-center text-foreground">
                              {bundle.total_sessions}
                            </TableCell>
                            <TableCell className="py-0 px-2 h-10 max-h-10 text-center text-foreground">
                              {formatPrice(bundle.price, bundle.currency || "EUR", { decimals: 0 })}
                            </TableCell>
                            <TableCell className="py-0 px-2 h-10 max-h-10 text-center text-foreground">
                              {bundle.validity_days ? `${bundle.validity_days}j` : "-"}
                            </TableCell>
                            <TableCell className="py-0 px-2 h-10 max-h-10 text-center">
                              {getStatusBadge(bundle.status)}
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
                                      navigate(`/admin/cures/templates/${bundle.id}`);
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
                                      openDelete(bundle.id);
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  )}
                </Table>
              </div>
            ) : (
              /* Sold bundles tab */
              <div className="overflow-x-auto h-full">
                <Table className="text-sm w-full table-fixed min-w-[700px]">
                  <TableHeader>
                    <TableRow className="bg-muted/20 h-8">
                      <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 w-[150px]">Client</TableHead>
                      <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 w-[150px]">Cure</TableHead>
                      <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 w-[120px]">Lieu</TableHead>
                      <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 text-center w-[120px]">{t("cures.remainingSessions")}</TableHead>
                      <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 text-center w-[100px]">{t("cures.expiresAt")}</TableHead>
                      <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 text-center w-[80px]">Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  {soldLoading ? (
                    <TableSkeleton rows={itemsPerPage} columns={6} />
                  ) : soldPagination.paginatedItems.length === 0 ? (
                    <TableEmptyState
                      colSpan={6}
                      icon={Package}
                      message="Aucune cure vendue"
                    />
                  ) : (
                    <TableBody>
                      {soldPagination.paginatedItems.map((cb) => {
                        const hotel = getHotelInfo(cb.hotel_id);
                        const clientName = `${cb.customers?.first_name || ""} ${cb.customers?.last_name || ""}`.trim();
                        const remaining = cb.total_sessions - cb.used_sessions;
                        return (
                          <TableRow key={cb.id} className="h-10 max-h-10">
                            <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                              <span className="truncate font-medium text-foreground">{clientName || "-"}</span>
                            </TableCell>
                            <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                              <span className="truncate text-foreground">{cb.treatment_bundles?.name || "-"}</span>
                            </TableCell>
                            <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                              <HotelCell hotel={hotel} />
                            </TableCell>
                            <TableCell className="py-0 px-2 h-10 max-h-10 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary rounded-full"
                                    style={{ width: `${(cb.used_sessions / cb.total_sessions) * 100}%` }}
                                  />
                                </div>
                                <span className="text-foreground text-[10px]">
                                  {cb.used_sessions}/{cb.total_sessions}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="py-0 px-2 h-10 max-h-10 text-center text-foreground">
                              {new Date(cb.expires_at).toLocaleDateString("fr-FR")}
                            </TableCell>
                            <TableCell className="py-0 px-2 h-10 max-h-10 text-center">
                              {getStatusBadge(cb.status)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  )}
                </Table>
              </div>
            )}
          </div>

          {needsPagination && (
            <TablePagination
              currentPage={activeTab === "templates" ? templatesPagination.currentPage : soldPagination.currentPage}
              totalPages={activeTab === "templates" ? templatesPagination.totalPages : soldPagination.totalPages}
              totalItems={activeTab === "templates" ? filteredTemplates.length : filteredSold.length}
              itemsPerPage={itemsPerPage}
              onPageChange={activeTab === "templates" ? templatesPagination.setCurrentPage : soldPagination.setCurrentPage}
              itemName={activeTab === "templates" ? "modeles" : "cures"}
            />
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && closeDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cures.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("cures.delete.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sell dialog */}
      <SellBundleDialog
        open={sellDialogOpen}
        onOpenChange={setSellDialogOpen}
        onSuccess={() => {
          refetchSold();
          setActiveTab("sold");
        }}
      />
    </div>
  );
}
