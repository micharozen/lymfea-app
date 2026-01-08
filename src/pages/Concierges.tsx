import { useState, useEffect } from "react";
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
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
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
import { cn } from "@/lib/utils";
import { AddConciergeDialog } from "@/components/AddConciergeDialog";
import { EditConciergeDialog } from "@/components/EditConciergeDialog";
import { StatusBadge } from "@/components/StatusBadge";

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
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editConciergeId, setEditConciergeId] = useState<string | null>(null);
  const [deleteConciergeId, setDeleteConciergeId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [userRole, setUserRole] = useState<string | null>(null);

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
    setCurrentPage(1);
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

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
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
      setDeleteConciergeId(null);
      fetchConcierges();
    } catch (error: any) {
      toast.error("Erreur lors de la suppression du concierge");
      console.error(error);
    }
  };

  const totalPages = Math.ceil(filteredConcierges.length / itemsPerPage);
  const paginatedConcierges = filteredConcierges.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-8 flex items-center gap-2">
            🛎️ Concierges
          </h1>
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-4">
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
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="inactive">Inactif</SelectItem>
              </SelectContent>
            </Select>

            {userRole === "admin" && (
              <Button 
                className="ml-auto bg-foreground text-background hover:bg-foreground/90"
                onClick={() => setShowAddDialog(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Ajouter un concierge
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
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
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                        {concierge.profile_image ? (
                          <img src={concierge.profile_image} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {getInitials(concierge.first_name, concierge.last_name)}
                          </span>
                        )}
                      </div>
                      <span className="truncate font-medium text-foreground">
                        {concierge.first_name} {concierge.last_name}
                      </span>
                    </div>
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
                    {(() => {
                      const hotelsList = getHotelsInfo(concierge.hotels);
                      return hotelsList.length > 0 ? (
                        <div className="flex items-center gap-1">
                          {hotelsList[0].image && (
                            <img
                              src={hotelsList[0].image}
                              alt={hotelsList[0].name}
                              className="w-4 h-4 rounded object-cover flex-shrink-0"
                            />
                          )}
                          <span className="truncate text-foreground">
                            {hotelsList.map(h => h.name).join(", ")}
                          </span>
                        </div>
                      ) : "-";
                    })()}
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
                          onClick={() => setEditConciergeId(concierge.id)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:bg-destructive hover:text-destructive-foreground"
                          onClick={() => setDeleteConciergeId(concierge.id)}
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

        {totalPages > 1 && (
          <div className="mt-6 flex justify-center">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
                    className={cn(
                      currentPage === 1 && "pointer-events-none opacity-50",
                      "cursor-pointer"
                    )}
                  />
                </PaginationItem>
                {[...Array(totalPages)].map((_, i) => (
                  <PaginationItem key={i + 1}>
                    <PaginationLink
                      onClick={() => handlePageChange(i + 1)}
                      isActive={currentPage === i + 1}
                      className="cursor-pointer"
                    >
                      {i + 1}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => currentPage < totalPages && handlePageChange(currentPage + 1)}
                    className={cn(
                      currentPage === totalPages && "pointer-events-none opacity-50",
                      "cursor-pointer"
                    )}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}

        <AddConciergeDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          onSuccess={fetchConcierges}
        />

        {editConciergeId && (
          <EditConciergeDialog
            open={!!editConciergeId}
            onOpenChange={(open) => !open && setEditConciergeId(null)}
            onSuccess={fetchConcierges}
            conciergeId={editConciergeId}
          />
        )}

        <AlertDialog open={!!deleteConciergeId} onOpenChange={(open) => !open && setDeleteConciergeId(null)}>
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
    </div>
  );
}
