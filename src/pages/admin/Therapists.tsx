import { useEffect, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
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
import AddTherapistDialog from "@/components/AddTherapistDialog";
import EditTherapistDialog from "@/components/EditTherapistDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { HotelsCell, TreatmentRoomsCell, PersonCell } from "@/components/table/EntityCell";
import { TablePagination } from "@/components/table/TablePagination";
import { TableSkeleton } from "@/components/table/TableSkeleton";
import { TableEmptyState } from "@/components/table/TableEmptyState";
import { SortableTableHead } from "@/components/table/SortableTableHead";
import { TherapistDetailDialog } from "@/components/admin/details/TherapistDetailDialog";
import { useLayoutCalculation } from "@/hooks/useLayoutCalculation";
import { useOverflowControl } from "@/hooks/useOverflowControl";
import { usePagination } from "@/hooks/usePagination";
import { useDialogState } from "@/hooks/useDialogState";
import { useTableSort } from "@/hooks/useTableSort";

interface Hotel {
  id: string;
  name: string;
  image: string | null;
}

interface TreatmentRoom {
  id: string;
  name: string;
  image: string | null;
}

interface Therapist {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  country_code: string;
  phone: string;
  profile_image: string | null;
  status: string;
  trunks: string | null;
  skills: string[];
  therapist_venues?: { hotel_id: string }[];
}

export default function Therapists() {
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [filteredTherapists, setFilteredTherapists] = useState<Therapist[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [rooms, setRooms] = useState<TreatmentRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [hotelFilter, setHotelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [userRole, setUserRole] = useState<string | null>(null);

  // Use shared hooks
  const { headerRef, filtersRef, itemsPerPage } = useLayoutCalculation();
  const { isAddOpen, openAdd, closeAdd, viewId: viewTherapistId, openView, closeView, editId: editTherapistId, openEdit, closeEdit, deleteId: deleteTherapistId, openDelete, closeDelete } = useDialogState<string>();
  const { toggleSort, getSortDirection, sortItems } = useTableSort<string>();

  useEffect(() => {
    fetchTherapists();
    fetchHotels();
    fetchRooms();
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
    filterTherapists();
  }, [searchQuery, hotelFilter, statusFilter, therapists]);

  const fetchHotels = async () => {
    const { data, error } = await supabase
      .from("hotels")
      .select("id, name, image")
      .order("name");

    if (error) {
      toast.error("Erreur lors du chargement des hôtels");
      return;
    }

    setHotels(data || []);
  };

  const fetchRooms = async () => {
    const { data, error } = await supabase
      .from("treatment_rooms")
      .select("id, name, image")
      .order("name");

    if (error) {
      console.error("Erreur lors du chargement des salles de soin:", error);
      return;
    }

    setRooms(data || []);
  };

  const fetchTherapists = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("therapists")
      .select(`
        *,
        therapist_venues(hotel_id)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erreur lors du chargement des thérapeutes");
      setLoading(false);
      return;
    }

    setTherapists(data || []);
    setLoading(false);
  };

  const filterTherapists = () => {
    let filtered = therapists;

    if (searchQuery) {
      filtered = filtered.filter(
        (hd) =>
          hd.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          hd.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          hd.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          hd.phone.includes(searchQuery)
      );
    }

    if (hotelFilter !== "all") {
      filtered = filtered.filter((hd) =>
        hd.therapist_venues?.some((hh) => hh.hotel_id === hotelFilter)
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((hd) => hd.status === statusFilter);
    }

    setFilteredTherapists(filtered);
  };

  // Sort therapists
  const sortedTherapists = useMemo(() => {
    return sortItems(filteredTherapists, (therapist, column) => {
      switch (column) {
        case "name": return `${therapist.first_name} ${therapist.last_name}`;
        case "email": return therapist.email;
        case "status": return therapist.status;
        default: return null;
      }
    });
  }, [filteredTherapists, sortItems]);

  // Use pagination hook
  const { currentPage, setCurrentPage, totalPages, paginatedItems: paginatedTherapists, needsPagination } = usePagination({
    items: sortedTherapists,
    itemsPerPage,
  });

  // Control overflow when pagination is needed
  useOverflowControl(!loading && needsPagination);

  // Get viewed/edited therapist
  const viewedTherapist = viewTherapistId ? therapists.find(h => h.id === viewTherapistId) || null : null;
  const editedTherapist = editTherapistId ? therapists.find(h => h.id === editTherapistId) || null : null;

  const columnCount = isAdmin ? 8 : 7;

  const getHotelsInfo = (therapistVenues?: { hotel_id: string }[]) => {
    if (!therapistVenues || therapistVenues.length === 0) {
      return [];
    }
    
    return therapistVenues
      .map((hh) => hotels.find((h) => h.id === hh.hotel_id))
      .filter(Boolean) as Hotel[];
  };

  const getSkillsDisplay = (skills: string[]) => {
    if (!skills || skills.length === 0) return "-";
    
    const skillMap: Record<string, string> = {
      men: "👨",
      women: "👩",
      barber: "💈",
      beauty: "💅",
    };

    const hasEmojiSkills = skills.some(skill => skillMap[skill]);
    
    if (hasEmojiSkills) {
      return skills.map((skill) => skillMap[skill] || "").filter(Boolean).join(" ");
    }
    
    return skills.join(", ");
  };

  const getRoomInfo = (roomIdOrName: string | null) => {
    if (!roomIdOrName) return null;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomIdOrName);

    if (isUuid) {
      return rooms.find((r) => r.id === roomIdOrName) || null;
    }

    if (roomIdOrName.includes(",")) {
      const firstItem = roomIdOrName.split(",")[0].trim();
      const isItemUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(firstItem);
      if (isItemUuid) {
        return rooms.find((r) => r.id === firstItem) || null;
      }
    }

    return null;
  };

  const getRoomNames = (roomIdOrName: string | null) => {
    if (!roomIdOrName) return "-";

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomIdOrName);

    if (isUuid) {
      const room = rooms.find((r) => r.id === roomIdOrName);
      return room?.name || "-";
    }

    if (roomIdOrName.includes(",")) {
      const roomNames = roomIdOrName.split(",").map((item) => {
        const trimmed = item.trim();
        const isItemUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
        if (isItemUuid) {
          const room = rooms.find((r) => r.id === trimmed);
          return room?.name;
        }
        return trimmed;
      }).filter(Boolean);

      return roomNames.length > 0 ? roomNames.join(", ") : "-";
    }

    return roomIdOrName;
  };

  const handleDelete = async () => {
    if (!deleteTherapistId) return;

    const { error } = await supabase
      .from("therapists")
      .delete()
      .eq("id", deleteTherapistId);

    if (error) {
      toast.error("Erreur lors de la suppression");
      return;
    }

    toast.success("Thérapeute supprimé avec succès");
    closeDelete();
    fetchTherapists();
  };

  return (
    <div className={cn("bg-background flex flex-col", needsPagination ? "h-screen overflow-hidden" : "min-h-0")}>
      <div className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6" ref={headerRef}>
        <div className="mb-4">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">Thérapeutes</h1>
          <p className="text-muted-foreground mt-1">
            Gérez vos thérapeutes et leurs informations
          </p>
        </div>
      </div>

      <div className={cn("flex-1 px-4 md:px-6 pb-4 md:pb-6", needsPagination ? "overflow-hidden" : "")}>
        <div className={cn("bg-card rounded-lg border border-border flex flex-col", needsPagination ? "h-full" : "")}>
          <div ref={filtersRef} className="p-4 border-b border-border flex flex-wrap gap-4 items-center flex-shrink-0">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Rechercher par nom, email ou téléphone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {isAdmin && (
              <Select value={hotelFilter} onValueChange={setHotelFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Tous les hôtels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les hôtels</SelectItem>
                  {hotels.map((hotel) => (
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
                <SelectItem value="active">Actif</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="inactive">Inactif</SelectItem>
              </SelectContent>
            </Select>

            {isAdmin && (
              <Button
                className="ml-auto bg-foreground text-background hover:bg-foreground/90"
                onClick={openAdd}
              >
                <Plus className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Ajouter un thérapeute</span>
              </Button>
            )}
          </div>

          <div className={cn("flex-1", needsPagination ? "min-h-0 overflow-hidden" : "")}>
            <div className="overflow-x-auto h-full">
            <Table className="text-xs w-full table-fixed min-w-[700px]">
              <TableHeader>
                <TableRow className="bg-muted/20 h-8">
                  <SortableTableHead column="name" sortDirection={getSortDirection("name")} onSort={toggleSort}>
                    Nom
                  </SortableTableHead>
                  <SortableTableHead column="email" sortDirection={getSortDirection("email")} onSort={toggleSort}>
                    Email
                  </SortableTableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Telephone</TableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Hotel</TableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Salles</TableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Competences</TableHead>
                  <SortableTableHead column="status" sortDirection={getSortDirection("status")} onSort={toggleSort}>
                    Statut
                  </SortableTableHead>
                  {isAdmin && <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              {loading ? (
                <TableSkeleton rows={itemsPerPage} columns={columnCount} />
              ) : paginatedTherapists.length === 0 ? (
                <TableEmptyState
                  colSpan={columnCount}
                  icon={Users}
                  message="Aucun thérapeute trouve"
                  description={searchQuery || hotelFilter !== "all" || statusFilter !== "all" ? "Essayez de modifier vos filtres" : undefined}
                  actionLabel={isAdmin ? "Ajouter un thérapeute" : undefined}
                  onAction={isAdmin ? openAdd : undefined}
                />
              ) : (
                <TableBody>
                  {paginatedTherapists.map((therapist) => (
                    <TableRow
                      key={therapist.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors h-10 max-h-10"
                      onClick={() => openView(therapist.id)}
                    >
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <PersonCell person={therapist} />
                      </TableCell>
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <span className="truncate block text-foreground">{therapist.email}</span>
                      </TableCell>
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <span className="truncate block text-foreground">
                          {therapist.country_code} {therapist.phone}
                        </span>
                      </TableCell>
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <HotelsCell hotels={getHotelsInfo(therapist.therapist_venues)} />
                      </TableCell>
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        {(() => {
                          const room = getRoomInfo(therapist.trunks);
                          const roomName = getRoomNames(therapist.trunks);
                          return room ? (
                            <TreatmentRoomsCell rooms={[room]} displayName={roomName} />
                          ) : <span className="text-foreground">-</span>;
                        })()}
                      </TableCell>
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <span className="truncate block text-foreground">{getSkillsDisplay(therapist.skills)}</span>
                      </TableCell>
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <StatusBadge status={therapist.status} type="entity" className="text-[10px] px-2 py-0.5 whitespace-nowrap" />
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
                                openEdit(therapist.id);
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
                                openDelete(therapist.id);
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
              totalItems={filteredTherapists.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              itemName="thérapeutes"
            />
          )}
        </div>
      </div>

      <AddTherapistDialog
        open={isAddOpen}
        onOpenChange={(open) => !open && closeAdd()}
        onSuccess={fetchTherapists}
      />

      {editedTherapist && (
        <EditTherapistDialog
          open={!!editTherapistId}
          onOpenChange={(open) => !open && closeEdit()}
          therapist={editedTherapist}
          onSuccess={fetchTherapists}
        />
      )}

      <AlertDialog open={!!deleteTherapistId} onOpenChange={(open) => !open && closeDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Etes-vous sur ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irreversible. Le thérapeute sera definitivement supprime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TherapistDetailDialog
        open={!!viewTherapistId}
        onOpenChange={(open) => !open && closeView()}
        therapist={viewedTherapist}
        hotels={hotels}
        rooms={rooms}
        onEdit={() => {
          if (viewTherapistId) {
            closeView();
            openEdit(viewTherapistId);
          }
        }}
      />
    </div>
  );
}