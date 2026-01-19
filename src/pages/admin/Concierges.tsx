import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { useLayoutCalculation } from "@/hooks/useLayoutCalculation";
import { useOverflowControl } from "@/hooks/useOverflowControl";
import { usePagination } from "@/hooks/usePagination";
import { useDialogState } from "@/hooks/useDialogState";

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
  hotels?: { hotel_id: string }[];
}

interface Hotel {
  id: string;
  name: string;
  image: string | null;
}

export default function Concierges() {
  const [concierges, setConcierges] = useState<Concierge[]>([]);
  const [filteredConcierges, setFilteredConcierges] = useState<Concierge[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [hotelFilter, setHotelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [userRole, setUserRole] = useState<string | null>(null);

  // Use shared hooks
  const { headerRef, filtersRef, itemsPerPage } = useLayoutCalculation();
  const { isAddOpen, openAdd, closeAdd, editId: editConciergeId, openEdit, closeEdit, deleteId: deleteConciergeId, openDelete, closeDelete } = useDialogState<string>();
  const { currentPage, setCurrentPage, totalPages, paginatedItems: paginatedConcierges, needsPagination } = usePagination({
    items: filteredConcierges,
    itemsPerPage,
  });

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
    fetchHotels();
    fetchConcierges();
  }, []);

  const fetchHotels = async () => {
    try {
      const { data, error } = await supabase
        .from("hotels")
        .select("id, name, image")
        .order("name");
      
      if (error) throw error;
      setHotels(data || []);
    } catch (error) {
      console.error("Error fetching hotels:", error);
    }
  };

  useEffect(() => {
    filterConcierges();
  }, [concierges, searchQuery, hotelFilter, statusFilter]);

  const fetchConcierges = async () => {
    try {
      const { data, error } = await supabase
        .from("concierges")
        .select(`
          *,
          hotels:concierge_hotels(hotel_id)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setConcierges(data || []);
    } catch (error: any) {
      toast.error("Erreur lors du chargement des concierges");
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

      toast.success("Concierge supprimé avec succès");
      closeDelete();
      fetchConcierges();
    } catch (error: any) {
      toast.error("Erreur lors de la suppression du concierge");
      console.error(error);
    }
  };

  if (loading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  return (
    <div className={cn("bg-background flex flex-col", needsPagination ? "h-screen overflow-hidden" : "min-h-0")}>
      <div className="flex-shrink-0 px-6 pt-6" ref={headerRef}>
        <div className="mb-4">
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            🛎️ Concierges
          </h1>
        </div>
      </div>

      <div className={cn("flex-1 px-6 pb-6", needsPagination ? "overflow-hidden" : "")}>
        <div className={cn("bg-card rounded-lg border border-border flex flex-col", needsPagination ? "h-full" : "")}>
          <div ref={filtersRef} className="p-4 border-b border-border flex flex-wrap gap-4 items-center flex-shrink-0">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={hotelFilter} onValueChange={setHotelFilter}>
              <SelectTrigger className="w-[180px]">
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

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tous les statuts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="active">Actif</SelectItem>
                <SelectItem value="inactive">Inactif</SelectItem>
              </SelectContent>
            </Select>

            {userRole === "admin" && (
              <Button
                className="ml-auto bg-foreground text-background hover:bg-foreground/90"
                onClick={openAdd}
              >
                <Plus className="h-4 w-4 mr-2" />
                Ajouter un concierge
              </Button>
            )}
          </div>

          <div className={cn("flex-1", needsPagination ? "min-h-0 overflow-hidden" : "")}>
            <Table className="text-xs w-full table-fixed">
              <TableHeader>
                <TableRow className="bg-muted/20 h-8">
                  <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Nom</TableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Email</TableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Téléphone</TableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Hôtel</TableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Statut</TableHead>
                  {userRole === "admin" && (
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedConcierges.length === 0 ? (
                  <TableRow className="h-10">
                    <TableCell
                      colSpan={userRole === "admin" ? 6 : 5}
                      className="py-0 px-2 h-10 text-center text-muted-foreground"
                    >
                      Aucun concierge trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedConcierges.map((concierge) => (
                  <TableRow key={concierge.id} className="cursor-pointer hover:bg-muted/50 transition-colors h-10 max-h-10">
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
                      <StatusBadge status={concierge.status} type="entity" className="text-[10px] px-2 py-0.5 whitespace-nowrap" />
                    </TableCell>
                    {userRole === "admin" && (
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => openEdit(concierge.id)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => openDelete(concierge.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {needsPagination && (
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredConcierges.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              itemName="concierges"
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
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer ce concierge ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConcierge}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}