import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useOrgScope } from "@/hooks/useOrgScope";
import { listHotelsForOrg, listConciergesForOrg } from "@shared/db";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Pencil, Trash2, Users } from "lucide-react";
import { VENUE_ROLES } from "@/lib/venueRoles";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { AddConciergeDialog } from "@/components/AddConciergeDialog";
import { EditConciergeDialog } from "@/components/EditConciergeDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { HotelsCell, PersonCell } from "@/components/table/EntityCell";
import { TablePagination } from "@/components/table/TablePagination";
import { TableSkeleton } from "@/components/table/TableSkeleton";
import { TableEmptyState } from "@/components/table/TableEmptyState";
import { SortableTableHead } from "@/components/table/SortableTableHead";
import { ConciergeDetailDialog } from "@/components/admin/details/ConciergeDetailDialog";
import { useLayoutCalculation } from "@/hooks/useLayoutCalculation";
import { useOverflowControl } from "@/hooks/useOverflowControl";
import { usePagination } from "@/hooks/usePagination";
import { useDialogState } from "@/hooks/useDialogState";
import { useTableSort } from "@/hooks/useTableSort";

interface Concierge {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  country_code: string;
  hotel_id: string | null;
  profile_image: string | null;
  status: string;
  venue_role: string | null;
  hotels?: { hotel_id: string }[];
}

interface Hotel {
  id: string;
  name: string;
  image: string | null;
}

export default function Concierges() {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const [concierges, setConcierges] = useState<Concierge[]>([]);
  const [filteredConcierges, setFilteredConcierges] = useState<Concierge[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [hotelFilter, setHotelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);

  // Use shared hooks
  const { headerRef, filtersRef, itemsPerPage } = useLayoutCalculation();
  const { isAddOpen, openAdd, closeAdd, viewId: viewConciergeId, openView, closeView, editId: editConciergeId, openEdit, closeEdit, deleteId: deleteConciergeId, openDelete, closeDelete } = useDialogState<string>();
  const { toggleSort, getSortDirection, sortItems } = useTableSort<string>();

  // Sort concierges
  const sortedConcierges = useMemo(() => {
    return sortItems(filteredConcierges, (concierge, column) => {
      switch (column) {
        case "name": return `${concierge.first_name} ${concierge.last_name}`;
        case "email": return concierge.email;
        case "status": return concierge.status;
        default: return null;
      }
    });
  }, [filteredConcierges, sortItems]);

  const { currentPage, setCurrentPage, totalPages, paginatedItems: paginatedConcierges, needsPagination } = usePagination({
    items: sortedConcierges,
    itemsPerPage,
  });

  // Get viewed concierge
  const viewedConcierge = viewConciergeId ? concierges.find(c => c.id === viewConciergeId) || null : null;

  // Control overflow when pagination is needed
  useOverflowControl(!loading && needsPagination);

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

  const scope = useOrgScope();

  useEffect(() => {
    if (!scope) return;
    fetchHotels();
    fetchConcierges();
  }, [scope]);

  const fetchHotels = async () => {
    if (!scope) return;
    try {
      const data = await listHotelsForOrg(supabase, scope);
      setHotels(data.map((h) => ({ id: h.id, name: h.name, image: h.image })));
    } catch (error) {
      console.error("Error fetching hotels:", error);
    }
  };

  useEffect(() => {
    filterConcierges();
  }, [concierges, searchQuery, hotelFilter, statusFilter]);

  const fetchConcierges = async () => {
    if (!scope) return;
    try {
      const data = await listConciergesForOrg(supabase, scope);
      setConcierges(data as unknown as Concierge[]);
    } catch (error: unknown) {
      toast.error(t('conciergesPage.loadError'));
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filterConcierges = () => {
    let filtered = [...concierges];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.first_name.toLowerCase().includes(query) ||
          c.last_name.toLowerCase().includes(query) ||
          c.email.toLowerCase().includes(query)
      );
    }

    if (hotelFilter !== "all") {
      filtered = filtered.filter((c) => c.hotel_id === hotelFilter);
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((c) => c.status === statusFilter);
    }

    setFilteredConcierges(filtered);
  };

  const getHotelInfo = (hotelId: string | null) => {
    if (!hotelId) return null;
    return hotels.find(h => h.id === hotelId);
  };

  const getHotelsInfo = (conciergeHotels?: { hotel_id: string }[]) => {
    if (!conciergeHotels || conciergeHotels.length === 0) return [];
    return conciergeHotels
      .map((h) => getHotelInfo(h.hotel_id))
      .filter(Boolean) as Hotel[];
  };

  const handleDeleteConcierge = async () => {
    if (!deleteConciergeId) return;

    try {
      const { error } = await supabase
        .from("concierges")
        .delete()
        .eq("id", deleteConciergeId);

      if (error) throw error;

      toast.success(t('conciergesPage.deleted'));
      closeDelete();
      fetchConcierges();
    } catch (error: any) {
      toast.error(t('conciergesPage.deleteError'));
      console.error(error);
    }
  };

  const handleResendInvite = async (concierge: Concierge) => {
    setResendingInviteId(concierge.id);
    try {
      const hotelIds = (concierge.hotels ?? []).map((h) => h.hotel_id);
      const { error } = await invokeEdgeFunction("invite-concierge", {
        body: {
          conciergeId: concierge.id,
          email: concierge.email,
          firstName: concierge.first_name,
          lastName: concierge.last_name,
          phone: concierge.phone,
          countryCode: concierge.country_code,
          hotelIds,
        },
      });
      if (error) throw error;
      toast.success(t('conciergesPage.inviteResent'));
    } catch (error) {
      toast.error(t('conciergesPage.inviteResendError'));
      console.error(error);
    } finally {
      setResendingInviteId(null);
    }
  };

  const columnCount = userRole === "admin" ? 7 : 6;

  return (
    <div className={cn("bg-background flex flex-col", needsPagination ? "h-screen overflow-hidden" : "min-h-0")}>
      <div className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6" ref={headerRef}>
        <div className="mb-4">
          <h1 className="text-lg font-medium text-foreground flex items-center gap-2">
            {t('conciergesPage.title')}
          </h1>
        </div>
      </div>

      <div className={cn("flex-1 px-4 md:px-6 pb-4 md:pb-6", needsPagination ? "overflow-hidden" : "")}>
        <div className={cn("bg-card rounded-lg border border-border flex flex-col", needsPagination ? "h-full" : "")}>
          <div ref={filtersRef} className="p-4 border-b border-border flex flex-wrap gap-4 items-center flex-shrink-0">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('conciergesPage.search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={hotelFilter} onValueChange={setHotelFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t('conciergesPage.allVenues')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('conciergesPage.allVenues')}</SelectItem>
                {hotels.map((hotel) => (
                  <SelectItem key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t('conciergesPage.allStatuses')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('conciergesPage.allStatuses')}</SelectItem>
                <SelectItem value="active">{t('conciergesPage.active')}</SelectItem>
                <SelectItem value="inactive">{t('conciergesPage.inactive')}</SelectItem>
              </SelectContent>
            </Select>

            {userRole === "admin" && (
              <Button
                className="ml-auto"
                onClick={openAdd}
              >
                {t('conciergesPage.new')}
              </Button>
            )}
          </div>

          <div className={cn("flex-1", needsPagination ? "min-h-0 overflow-hidden" : "")}>
            <div className="overflow-x-auto h-full">
            <Table className="text-sm w-full table-fixed min-w-[600px]">
              <TableHeader>
                <TableRow className="bg-muted/20 h-8">
                  <SortableTableHead column="name" sortDirection={getSortDirection("name")} onSort={toggleSort}>
                    {t('conciergesPage.colName')}
                  </SortableTableHead>
                  <SortableTableHead column="email" sortDirection={getSortDirection("email")} onSort={toggleSort}>
                    Email
                  </SortableTableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">
                    {t('conciergesPage.colPhone')}
                  </TableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">
                    {t('conciergesPage.colVenues')}
                  </TableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">
                    {t('conciergesPage.colRole')}
                  </TableHead>
                  <SortableTableHead column="status" sortDirection={getSortDirection("status")} onSort={toggleSort}>
                    {t('conciergesPage.colStatus')}
                  </SortableTableHead>
                  {userRole === "admin" && (
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate text-right">
                      {t('common:actions')}
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              {loading ? (
                <TableSkeleton rows={itemsPerPage} columns={columnCount} />
              ) : paginatedConcierges.length === 0 ? (
                <TableEmptyState
                  colSpan={columnCount}
                  icon={Users}
                  message={t('conciergesPage.empty')}
                  description={searchQuery || hotelFilter !== "all" || statusFilter !== "all" ? t('conciergesPage.emptyHint') : undefined}
                  actionLabel={userRole === "admin" ? t('conciergesPage.addMember') : undefined}
                  onAction={userRole === "admin" ? openAdd : undefined}
                />
              ) : (
                <TableBody>
                  {paginatedConcierges.map((concierge) => (
                    <TableRow
                      key={concierge.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors h-10 max-h-10"
                      onClick={() => openView(concierge.id)}
                    >
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <PersonCell person={concierge} />
                      </TableCell>
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <span className="truncate block text-foreground">{concierge.email}</span>
                      </TableCell>
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <span className="truncate block text-foreground">
                          {concierge.country_code} {concierge.phone}
                        </span>
                      </TableCell>
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <HotelsCell hotels={getHotelsInfo(concierge.hotels)} />
                      </TableCell>
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <span className="truncate block text-foreground">
                          {concierge.venue_role
                            ? (() => {
                                const role = VENUE_ROLES.find(r => r.value === concierge.venue_role);
                                if (!role) return concierge.venue_role;
                                return i18n.language.startsWith('en') ? role.labelEn : role.labelFr;
                              })()
                            : '-'}
                        </span>
                      </TableCell>
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <StatusBadge status={concierge.status} type="entity" className="text-[10px] px-2 py-0.5 whitespace-nowrap" />
                      </TableCell>
                      {userRole === "admin" && (
                        <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEdit(concierge.id);
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
                                openDelete(concierge.id);
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
              totalItems={filteredConcierges.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              itemName={t('conciergesPage.itemName')}
            />
          )}
        </div>
      </div>

      <AddConciergeDialog
        open={isAddOpen}
        onOpenChange={(open) => !open && closeAdd()}
        onSuccess={fetchConcierges}
      />

      {editConciergeId && (
        <EditConciergeDialog
          open={!!editConciergeId}
          onOpenChange={(open) => !open && closeEdit()}
          onSuccess={fetchConcierges}
          conciergeId={editConciergeId}
        />
      )}

      <AlertDialog open={!!deleteConciergeId} onOpenChange={(open) => !open && closeDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('conciergesPage.confirmDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('conciergesPage.confirmDeleteDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConcierge}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common:buttons.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConciergeDetailDialog
        open={!!viewConciergeId}
        onOpenChange={(open) => !open && closeView()}
        concierge={viewedConcierge}
        hotels={hotels}
        onResendInvite={
          userRole === "admin" && viewedConcierge && viewedConcierge.status !== "active"
            ? () => handleResendInvite(viewedConcierge)
            : undefined
        }
        isResendingInvite={!!viewedConcierge && resendingInviteId === viewedConcierge.id}
        onEdit={() => {
          if (viewConciergeId) {
            closeView();
            openEdit(viewConciergeId);
          }
        }}
      />
    </div>
  );
}