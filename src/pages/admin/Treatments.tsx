import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/formatPrice";
import { Search, Pencil, Trash2, Plus, Scissors } from "lucide-react";
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
import { AddTreatmentMenuDialog } from "@/components/AddTreatmentMenuDialog";
import { EditTreatmentMenuDialog } from "@/components/EditTreatmentMenuDialog";
import { HotelCell } from "@/components/table/EntityCell";
import { TablePagination } from "@/components/table/TablePagination";
import { TableSkeleton } from "@/components/table/TableSkeleton";
import { TableEmptyState } from "@/components/table/TableEmptyState";
import { SortableTableHead } from "@/components/table/SortableTableHead";
import { TreatmentDetailDialog } from "@/components/admin/details/TreatmentDetailDialog";
import { useLayoutCalculation } from "@/hooks/useLayoutCalculation";
import { useOverflowControl } from "@/hooks/useOverflowControl";
import { usePagination } from "@/hooks/usePagination";
import { useDialogState } from "@/hooks/useDialogState";
import { useTableSort } from "@/hooks/useTableSort";
import { useIsMobile } from "@/hooks/use-mobile";
import { TreatmentCard } from "@/components/table/cards/TreatmentCard";

export default function TreatmentMenus() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [hotelFilter, setHotelFilter] = useState<string>("all");
  const [userRole, setUserRole] = useState<string | null>(null);

  // Use shared hooks
  const { headerRef, filtersRef, itemsPerPage } = useLayoutCalculation();
  const { isAddOpen, openAdd, closeAdd, viewId: viewMenuId, openView, closeView, editId: editMenuId, openEdit, closeEdit, deleteId: deleteMenuId, openDelete, closeDelete } = useDialogState<string>();
  const { toggleSort, getSortDirection, sortItems } = useTableSort<string>();
  const isMobile = useIsMobile();

  useEffect(() => {
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

    fetchUserRole();
  }, []);

  const isAdmin = userRole === "admin";

  const { data: menus, refetch, isLoading } = useQuery({
    queryKey: ["treatment-menus"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatment_menus")
        .select("*")
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });

      if (error) throw error;
      return data;
    },
  });

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

  const filteredMenus = menus?.filter((menu) => {
    const matchesSearch =
      menu.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      menu.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || menu.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || menu.category === categoryFilter;
    const matchesHotel = hotelFilter === "all" || menu.hotel_id === hotelFilter;

    return matchesSearch && matchesStatus && matchesCategory && matchesHotel;
  }) || [];

  // Sort menus
  const sortedMenus = useMemo(() => {
    return sortItems(filteredMenus, (menu, column) => {
      switch (column) {
        case "name": return menu.name;
        case "duration": return menu.duration;
        case "price": return menu.price;
        case "category": return menu.category;
        case "status": return menu.status;
        default: return null;
      }
    });
  }, [filteredMenus, sortItems]);

  // Use pagination hook
  const { currentPage, setCurrentPage, totalPages, paginatedItems: paginatedMenus, needsPagination } = usePagination({
    items: sortedMenus,
    itemsPerPage,
  });

  // Control overflow when pagination is needed
  useOverflowControl(!isLoading && needsPagination);

  // Get viewed/edited menu
  const viewedMenu = viewMenuId ? menus?.find(m => m.id === viewMenuId) || null : null;
  const editedMenu = editMenuId ? menus?.find(m => m.id === editMenuId) || null : null;

  const columnCount = isAdmin ? 9 : 8;

  const categories = Array.from(
    new Set(menus?.map((menu) => menu.category).filter(Boolean))
  );

  const handleDelete = async () => {
    if (!deleteMenuId) return;

    const { error } = await supabase
      .from("treatment_menus")
      .delete()
      .eq("id", deleteMenuId);

    if (error) {
      toast.error("Erreur lors de la suppression du menu");
      return;
    }

    toast.success("Menu supprime avec succes");
    closeDelete();
    refetch();
  };

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return "-";
    return `${minutes}min`;
  };

  const formatLeadTime = (minutes: number | null) => {
    if (!minutes) return "-";
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0 ? `${hours}h${remainingMinutes}` : `${hours}h`;
    }
    return `${minutes}min`;
  };

  const getHotelInfo = (hotelId: string | null) => {
    if (!hotelId || !hotels) return null;
    return hotels.find((h) => h.id === hotelId);
  };

  return (
    <div className={cn("bg-background flex flex-col", needsPagination ? "h-screen overflow-hidden" : "min-h-0")}>
      <div className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6" ref={headerRef}>
        <div className="mb-4 md:mb-6 flex items-center justify-between">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
            💆 Menus de soins
          </h1>
          {isAdmin && (
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Ajouter une prestation</span>
            </Button>
          )}
        </div>
      </div>

      <div className={cn("flex-1 px-4 md:px-6 pb-4 md:pb-6", needsPagination ? "overflow-hidden" : "")}>
        <div className={cn("bg-card rounded-lg border border-border flex flex-col", needsPagination ? "h-full" : "")}>
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

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrer par catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les catégories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isAdmin && (
              <Select value={hotelFilter} onValueChange={setHotelFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filtrer par hôtel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les hôtels</SelectItem>
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
                <SelectValue placeholder="Filtrer par statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="active">Actif</SelectItem>
                <SelectItem value="inactive">Inactif</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className={cn("flex-1", needsPagination ? "min-h-0 overflow-hidden" : "")}>
            {/* Mobile: Card View */}
            {isMobile ? (
              <div className="p-4 space-y-3 overflow-y-auto h-full">
                {isLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: itemsPerPage }).map((_, i) => (
                      <div key={i} className="bg-card border border-border rounded-lg p-4 animate-pulse">
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-12 h-12 rounded-lg bg-muted" />
                          <div className="flex-1">
                            <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                            <div className="h-3 bg-muted rounded w-1/2" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="h-8 bg-muted rounded" />
                          <div className="h-8 bg-muted rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : paginatedMenus.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Scissors className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Aucune prestation trouvee</p>
                    {(searchQuery || hotelFilter !== "all" || statusFilter !== "all" || categoryFilter !== "all") && (
                      <p className="text-sm text-muted-foreground mt-1">Essayez de modifier vos filtres</p>
                    )}
                    {isAdmin && (
                      <Button onClick={openAdd} className="mt-4">
                        <Plus className="h-4 w-4 mr-2" />
                        Ajouter une prestation
                      </Button>
                    )}
                  </div>
                ) : (
                  paginatedMenus.map((menu) => (
                    <TreatmentCard
                      key={menu.id}
                      treatment={menu}
                      hotel={getHotelInfo(menu.hotel_id)}
                      isAdmin={isAdmin}
                      onView={() => openView(menu.id)}
                      onEdit={() => openEdit(menu.id)}
                      onDelete={() => openDelete(menu.id)}
                    />
                  ))
                )}
              </div>
            ) : (
              /* Desktop: Table View */
              <div className="overflow-x-auto h-full">
                <Table className="text-xs w-full table-fixed min-w-[700px]">
                  <TableHeader>
                    <TableRow className="bg-muted/20 h-8">
                      <SortableTableHead column="name" sortDirection={getSortDirection("name")} onSort={toggleSort} className="w-[180px]">
                        Prestation
                      </SortableTableHead>
                      <SortableTableHead column="duration" sortDirection={getSortDirection("duration")} onSort={toggleSort} align="center" className="w-[70px]">
                        Duree
                      </SortableTableHead>
                      <SortableTableHead column="price" sortDirection={getSortDirection("price")} onSort={toggleSort} align="center" className="w-[60px]">
                        Tarif
                      </SortableTableHead>
                      <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate text-center w-[70px]">Delai</TableHead>
                      <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate text-center w-[70px]">Public</TableHead>
                      <SortableTableHead column="category" sortDirection={getSortDirection("category")} onSort={toggleSort} align="center" className="w-[90px]">
                        Categorie
                      </SortableTableHead>
                      <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate w-[140px]">Hotel</TableHead>
                      <SortableTableHead column="status" sortDirection={getSortDirection("status")} onSort={toggleSort} align="center" className="w-[70px]">
                        Statut
                      </SortableTableHead>
                      {isAdmin && <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate text-right w-[70px]">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  {isLoading ? (
                    <TableSkeleton rows={itemsPerPage} columns={columnCount} />
                  ) : paginatedMenus.length === 0 ? (
                    <TableEmptyState
                      colSpan={columnCount}
                      icon={Scissors}
                      message="Aucune prestation trouvee"
                      description={searchQuery || hotelFilter !== "all" || statusFilter !== "all" || categoryFilter !== "all" ? "Essayez de modifier vos filtres" : undefined}
                      actionLabel={isAdmin ? "Ajouter une prestation" : undefined}
                      onAction={isAdmin ? openAdd : undefined}
                    />
                  ) : (
                    <TableBody>
                      {paginatedMenus.map((menu) => {
                        const hotel = getHotelInfo(menu.hotel_id);
                        return (
                          <TableRow
                            key={menu.id}
                            className="cursor-pointer hover:bg-muted/50 transition-colors h-10 max-h-10"
                            onClick={() => openView(menu.id)}
                          >
                            <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                {menu.image ? (
                                  <img
                                    src={menu.image}
                                    alt={menu.name}
                                    className="w-6 h-6 rounded object-cover flex-shrink-0"
                                  />
                                ) : (
                                  <div className="w-6 h-6 rounded bg-muted flex items-center justify-center text-muted-foreground flex-shrink-0 text-xs">
                                    💆
                                  </div>
                                )}
                                <span className="truncate font-medium text-foreground">{menu.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden text-center">
                              <span className="truncate block text-foreground">
                                {menu.price_on_request ? "Sur demande" : formatDuration(menu.duration)}
                              </span>
                            </TableCell>
                            <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden text-center">
                              <span className="truncate block text-foreground">
                                {menu.price_on_request ? "Sur demande" : formatPrice(menu.price, menu.currency || 'EUR', { decimals: 0 })}
                              </span>
                            </TableCell>
                            <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden text-center">
                              <span className="truncate block text-foreground">{formatLeadTime(menu.lead_time)}</span>
                            </TableCell>
                            <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden text-center">
                              <span className="text-xs">
                                {menu.service_for === "Male"
                                  ? "👨"
                                  : menu.service_for === "Female"
                                  ? "👩"
                                  : "👥"}
                              </span>
                            </TableCell>
                            <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden text-center">
                              <span className="truncate block text-foreground">{menu.category}</span>
                            </TableCell>
                            <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                              <HotelCell hotel={hotel} />
                            </TableCell>
                            <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden text-center">
                              <Badge
                                variant={menu.status === "active" ? "default" : "secondary"}
                                className={cn(
                                  "text-[10px] px-2 py-0.5",
                                  menu.status === "active" &&
                                    "bg-green-500/10 text-green-700 hover:bg-green-500/20",
                                  menu.status === "inactive" &&
                                    "bg-red-500/10 text-red-700 hover:bg-red-500/20"
                                )}
                              >
                                {menu.status === "active" ? "Actif" : menu.status === "inactive" ? "Inactif" : menu.status}
                              </Badge>
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
                                      openEdit(menu.id);
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
                                      openDelete(menu.id);
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
            )}
          </div>

          {needsPagination && (
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredMenus?.length || 0}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              itemName="prestations"
            />
          )}
        </div>
      </div>

      <AlertDialog open={!!deleteMenuId} onOpenChange={(open) => !open && closeDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Etes-vous sur de vouloir supprimer ce menu de soins ? Cette action est
              irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddTreatmentMenuDialog
        open={isAddOpen}
        onOpenChange={(open) => !open && closeAdd()}
        onSuccess={refetch}
      />

      {editedMenu && (
        <EditTreatmentMenuDialog
          open={!!editMenuId}
          onOpenChange={(open) => !open && closeEdit()}
          menu={editedMenu}
          onSuccess={refetch}
        />
      )}

      <TreatmentDetailDialog
        open={!!viewMenuId}
        onOpenChange={(open) => !open && closeView()}
        treatment={viewedMenu}
        hotel={viewedMenu ? getHotelInfo(viewedMenu.hotel_id) : null}
        onEdit={isAdmin ? () => {
          if (viewMenuId) {
            closeView();
            openEdit(viewMenuId);
          }
        } : undefined}
      />
    </div>
  );
}
