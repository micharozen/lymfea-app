import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Search, Pencil, Trash2, Plus, DoorOpen } from "lucide-react";
import { AddTreatmentRoomDialog } from "@/components/AddTreatmentRoomDialog";
import { EditTreatmentRoomDialog } from "@/components/EditTreatmentRoomDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { HotelCell } from "@/components/table/EntityCell";
import { TablePagination } from "@/components/table/TablePagination";
import { TableSkeleton } from "@/components/table/TableSkeleton";
import { TableEmptyState } from "@/components/table/TableEmptyState";
import { SortableTableHead } from "@/components/table/SortableTableHead";
import { TreatmentRoomDetailDialog } from "@/components/admin/details/TreatmentRoomDetailDialog";
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
import { useLayoutCalculation } from "@/hooks/useLayoutCalculation";
import { useOverflowControl } from "@/hooks/useOverflowControl";
import { usePagination } from "@/hooks/usePagination";
import { useDialogState } from "@/hooks/useDialogState";
import { useTableSort } from "@/hooks/useTableSort";

export default function TreatmentRooms() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [hotelFilter, setHotelFilter] = useState<string>("all");
  const queryClient = useQueryClient();
  const [userRole, setUserRole] = useState<string | null>(null);

  // Use shared hooks
  const { headerRef, filtersRef, itemsPerPage } = useLayoutCalculation();
  const { isAddOpen, openAdd, closeAdd, viewId: viewRoomId, openView, closeView, editId: editRoomId, openEdit, closeEdit, deleteId: deleteRoomId, openDelete, closeDelete } = useDialogState<string>();
  const { toggleSort, getSortDirection, sortItems } = useTableSort<string>();

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

  const { data: rooms, isLoading } = useQuery({
    queryKey: ["treatment-rooms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatment_rooms")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Fetch upcoming bookings for each room
  const { data: upcomingBookings } = useQuery({
    queryKey: ["treatment-room-upcoming-bookings"],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from("bookings")
        .select("room_id, booking_date, booking_time")
        .not("room_id", "is", null)
        .gte("booking_date", today)
        .not("status", "in", '("cancelled","completed")')
        .order("booking_date", { ascending: true })
        .order("booking_time", { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  // Get the next booking for a room
  const getNextBooking = (roomId: string) => {
    if (!upcomingBookings) return null;
    const booking = upcomingBookings.find(b => b.room_id === roomId);
    if (!booking) return null;
    return `${booking.booking_date} ${booking.booking_time}`;
  };

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

  const getHotelInfo = (hotelId: string | null) => {
    if (!hotelId || !hotels) return null;
    return hotels.find(h => h.id === hotelId);
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("treatment_rooms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-rooms"] });
      toast.success("Salle de soin supprimee avec succes");
      closeDelete();
    },
    onError: () => {
      toast.error("Erreur lors de la suppression de la salle de soin");
    },
  });

  const filteredRooms = rooms?.filter((room) => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch =
      room.name?.toLowerCase().includes(searchLower) ||
      room.room_type?.toLowerCase().includes(searchLower);

    const matchesStatus = statusFilter === "all" || room.status === statusFilter;
    const matchesHotel = hotelFilter === "all" || room.hotel_id === hotelFilter;

    return matchesSearch && matchesStatus && matchesHotel;
  }) || [];

  // Sort rooms
  const sortedRooms = useMemo(() => {
    return sortItems(filteredRooms, (room, column) => {
      switch (column) {
        case "name": return room.name;
        case "type": return room.room_type;
        case "status": return room.status;
        default: return null;
      }
    });
  }, [filteredRooms, sortItems]);

  // Use pagination hook
  const { currentPage, setCurrentPage, totalPages, paginatedItems: paginatedRooms, needsPagination } = usePagination({
    items: sortedRooms,
    itemsPerPage,
  });

  // Control overflow when pagination is needed
  useOverflowControl(!isLoading && needsPagination);

  // Get viewed/edited room
  const viewedRoom = viewRoomId ? rooms?.find(r => r.id === viewRoomId) || null : null;
  const editedRoom = editRoomId ? rooms?.find(r => r.id === editRoomId) || null : null;

  const confirmDelete = () => {
    if (deleteRoomId) {
      deleteMutation.mutate(deleteRoomId);
    }
  };

  const columnCount = isAdmin ? 6 : 5;

  return (
    <div className={cn("bg-background flex flex-col", needsPagination ? "h-screen overflow-hidden" : "min-h-0")}>
      <div className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6" ref={headerRef}>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
            Salles de soin
          </h1>
          {isAdmin && (
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Ajouter une salle</span>
            </Button>
          )}
        </div>
      </div>

      <div className={cn("flex-1 px-4 md:px-6 pb-4 md:pb-6", needsPagination ? "overflow-hidden" : "")}>
        <div className={cn("bg-card rounded-lg border border-border flex flex-col", needsPagination ? "h-full" : "")}>
          <div ref={filtersRef} className="p-4 border-b border-border flex flex-wrap gap-4 items-center flex-shrink-0">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tous les statuts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="active">Actif</SelectItem>
                <SelectItem value="inactive">Inactif</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
              </SelectContent>
            </Select>

            {isAdmin && (
              <Select value={hotelFilter} onValueChange={setHotelFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Tous les hotels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les hotels</SelectItem>
                  {hotels?.map((hotel) => (
                    <SelectItem key={hotel.id} value={hotel.id}>
                      {hotel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className={cn("flex-1", needsPagination ? "min-h-0 overflow-hidden" : "")}>
            <div className="overflow-x-auto h-full">
            <Table className="text-xs w-full table-fixed min-w-[650px]">
              <TableHeader>
                <TableRow className="bg-muted/20 h-8">
                  <SortableTableHead column="name" sortDirection={getSortDirection("name")} onSort={toggleSort}>
                    Nom
                  </SortableTableHead>
                  <SortableTableHead column="type" sortDirection={getSortDirection("type")} onSort={toggleSort}>
                    Type
                  </SortableTableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Hotel</TableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Prochaine res.</TableHead>
                  <SortableTableHead column="status" sortDirection={getSortDirection("status")} onSort={toggleSort}>
                    Statut
                  </SortableTableHead>
                  {isAdmin && <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              {isLoading ? (
                <TableSkeleton rows={itemsPerPage} columns={columnCount} />
              ) : paginatedRooms.length === 0 ? (
                <TableEmptyState
                  colSpan={columnCount}
                  icon={DoorOpen}
                  message="Aucune salle de soin trouvee"
                  description={searchQuery || hotelFilter !== "all" || statusFilter !== "all" ? "Essayez de modifier vos filtres" : undefined}
                  actionLabel={isAdmin ? "Ajouter une salle" : undefined}
                  onAction={isAdmin ? openAdd : undefined}
                />
              ) : (
                <TableBody>
                  {paginatedRooms.map((room) => (
                    <TableRow
                      key={room.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors h-10 max-h-10"
                      onClick={() => openView(room.id)}
                    >
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          {room.image ? (
                            <img
                              src={room.image}
                              alt={room.name}
                              className="w-6 h-6 rounded object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded bg-muted flex items-center justify-center flex-shrink-0 text-xs">
                              🚪
                            </div>
                          )}
                          <span className="truncate font-medium text-foreground">{room.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <span className="truncate block text-foreground">{room.room_type}</span>
                      </TableCell>
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <HotelCell hotel={getHotelInfo(room.hotel_id)} />
                      </TableCell>
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <span className="truncate block text-foreground">
                          {(() => {
                            const nextBooking = getNextBooking(room.id);
                            if (!nextBooking) return "-";
                            return new Date(nextBooking).toLocaleString("fr-FR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit"
                            });
                          })()}
                        </span>
                      </TableCell>
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <StatusBadge status={room.status} type="entity" className="text-[10px] px-2 py-0.5 whitespace-nowrap" />
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
                                openEdit(room.id);
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
                                openDelete(room.id);
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
              totalItems={filteredRooms.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              itemName="salles"
            />
          )}
        </div>
      </div>

      <AddTreatmentRoomDialog
        open={isAddOpen}
        onOpenChange={(open) => !open && closeAdd()}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["treatment-rooms"] });
        }}
      />

      {editedRoom && (
        <EditTreatmentRoomDialog
          open={!!editRoomId}
          onOpenChange={(open) => !open && closeEdit()}
          room={editedRoom}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["treatment-rooms"] });
          }}
        />
      )}

      <AlertDialog open={!!deleteRoomId} onOpenChange={(open) => !open && closeDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Etes-vous sur de vouloir supprimer cette salle de soin ? Cette action est
              irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TreatmentRoomDetailDialog
        open={!!viewRoomId}
        onOpenChange={(open) => !open && closeView()}
        room={viewedRoom}
        hotel={viewedRoom ? getHotelInfo(viewedRoom.hotel_id) : null}
        nextBooking={viewedRoom ? getNextBooking(viewedRoom.id) : null}
        onEdit={() => {
          if (viewRoomId) {
            closeView();
            openEdit(viewRoomId);
          }
        }}
      />
    </div>
  );
}
