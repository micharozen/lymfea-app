import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { AddHotelDialog } from "@/components/AddHotelDialog";
import { EditHotelDialog } from "@/components/EditHotelDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Hotel {
  id: string;
  name: string;
  image: string | null;
  address: string;
  city: string;
  country: string;
  created_at: string;
  updated_at: string;
}

export default function Hotels() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [filteredHotels, setFilteredHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editHotelId, setEditHotelId] = useState<string | null>(null);
  const [deleteHotelId, setDeleteHotelId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchHotels();
  }, []);

  useEffect(() => {
    filterHotels();
    setCurrentPage(1);
  }, [hotels, searchQuery]);

  const fetchHotels = async () => {
    try {
      const { data, error } = await supabase
        .from("hotels")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setHotels(data || []);
    } catch (error: any) {
      toast.error("Erreur lors du chargement des hôtels");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filterHotels = () => {
    let filtered = [...hotels];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (h) =>
          h.name.toLowerCase().includes(query) ||
          h.city.toLowerCase().includes(query) ||
          h.country.toLowerCase().includes(query)
      );
    }

    setFilteredHotels(filtered);
  };

  const handleDeleteHotel = async () => {
    if (!deleteHotelId) return;

    try {
      const { error } = await supabase
        .from("hotels")
        .delete()
        .eq("id", deleteHotelId);

      if (error) throw error;

      toast.success("Hôtel supprimé avec succès");
      setDeleteHotelId(null);
      fetchHotels();
    } catch (error: any) {
      toast.error("Erreur lors de la suppression de l'hôtel");
      console.error(error);
    }
  };

  const totalPages = Math.ceil(filteredHotels.length / itemsPerPage);
  const paginatedHotels = filteredHotels.slice(
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
      <div className="max-w-6xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-8">🏨 Hôtels</h1>
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

            <Button 
              className="ml-auto bg-foreground text-background hover:bg-foreground/90"
              onClick={() => setShowAddDialog(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Ajouter un hôtel
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Hôtel</TableHead>
                <TableHead className="font-semibold">Localisation</TableHead>
                <TableHead className="font-semibold">Adresse</TableHead>
                <TableHead className="font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedHotels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Aucun hôtel trouvé
                  </TableCell>
                </TableRow>
              ) : (
                paginatedHotels.map((hotel) => (
                  <TableRow key={hotel.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 rounded-md">
                          <AvatarImage src={hotel.image || ""} />
                          <AvatarFallback className="bg-muted rounded-md">
                            {hotel.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="font-medium">{hotel.name}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium">{hotel.city}</div>
                        <div className="text-muted-foreground">{hotel.country}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">{hotel.address}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-accent hover:text-accent-foreground transition-colors"
                          onClick={() => setEditHotelId(hotel.id)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-destructive hover:text-destructive-foreground transition-colors"
                          onClick={() => setDeleteHotelId(hotel.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
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

        <AddHotelDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          onSuccess={fetchHotels}
        />

        {editHotelId && (
          <EditHotelDialog
            open={!!editHotelId}
            onOpenChange={(open) => !open && setEditHotelId(null)}
            onSuccess={fetchHotels}
            hotelId={editHotelId}
          />
        )}

        <AlertDialog open={!!deleteHotelId} onOpenChange={(open) => !open && setDeleteHotelId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer cet hôtel ? Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteHotel}
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
