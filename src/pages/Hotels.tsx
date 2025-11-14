import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Search, Pencil, Trash2, MapPin, Users, Package, DollarSign, Calendar } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AddHotelDialog } from "@/components/AddHotelDialog";
import { EditHotelDialog } from "@/components/EditHotelDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Concierge {
  id: string;
  first_name: string;
  last_name: string;
  profile_image: string | null;
}

interface Hotel {
  id: string;
  name: string;
  image: string | null;
  cover_image: string | null;
  address: string;
  city: string;
  country: string;
  postal_code: string | null;
  currency: string;
  vat: number;
  hotel_commission: number;
  hairdresser_commission: number;
  status: string;
  created_at: string;
  updated_at: string;
  concierges?: Concierge[];
}

export default function Hotels() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [filteredHotels, setFilteredHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editHotelId, setEditHotelId] = useState<string | null>(null);
  const [deleteHotelId, setDeleteHotelId] = useState<string | null>(null);

  useEffect(() => {
    fetchHotels();
  }, []);

  useEffect(() => {
    filterHotels();
  }, [hotels, searchQuery, statusFilter]);

  const fetchHotels = async () => {
    try {
      // Fetch hotels
      const { data: hotelsData, error: hotelsError } = await supabase
        .from("hotels")
        .select("*")
        .order("created_at", { ascending: false });

      if (hotelsError) throw hotelsError;

      // Fetch concierges with their hotel associations
      const { data: conciergeMappings, error: mappingsError } = await supabase
        .from("concierge_hotels")
        .select("hotel_id, concierge_id");

      if (mappingsError) throw mappingsError;

      // Fetch all concierges
      const { data: conciergesData, error: conciergesError } = await supabase
        .from("concierges")
        .select("id, first_name, last_name, profile_image");

      if (conciergesError) throw conciergesError;

      // Map concierges to hotels
      const hotelsWithConcierges = (hotelsData || []).map((hotel) => {
        const hotelConcierges = (conciergeMappings || [])
          .filter((mapping) => mapping.hotel_id === hotel.id)
          .map((mapping) => {
            return (conciergesData || []).find((c) => c.id === mapping.concierge_id);
          })
          .filter((c): c is Concierge => c !== undefined);

        return {
          ...hotel,
          concierges: hotelConcierges,
        };
      });

      setHotels(hotelsWithConcierges);
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

    if (statusFilter !== "all") {
      filtered = filtered.filter((h) => h.status === statusFilter);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-8 flex items-center gap-2">
            🏨 Hotels
          </h1>
        </div>

        <div className="mb-6 flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="Active">Actif</SelectItem>
              <SelectItem value="Inactive">Inactif</SelectItem>
            </SelectContent>
          </Select>

          <Button 
            className="ml-auto bg-foreground text-background hover:bg-foreground/90"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Ajouter un hôtel
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold w-[250px] whitespace-nowrap">
                  Nom de l&apos;hôtel
                </TableHead>
                <TableHead className="font-semibold w-[300px] whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Localisation
                  </div>
                </TableHead>
                <TableHead className="font-semibold w-[250px] whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Concierges
                  </div>
                </TableHead>
                <TableHead className="font-semibold w-[120px] text-center whitespace-nowrap">
                  <div className="flex items-center justify-center gap-2">
                    <Package className="h-4 w-4" />
                    Liste de boxes
                  </div>
                </TableHead>
                <TableHead className="font-semibold w-[100px] text-center whitespace-nowrap">Statut</TableHead>
                <TableHead className="font-semibold w-[120px] text-center whitespace-nowrap">
                  <div className="flex items-center justify-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Ventes totales
                  </div>
                </TableHead>
                <TableHead className="font-semibold w-[120px] text-center whitespace-nowrap">
                  <div className="flex items-center justify-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Réservations
                  </div>
                </TableHead>
                <TableHead className="font-semibold w-[100px] text-right whitespace-nowrap">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHotels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Aucun hôtel trouvé
                  </TableCell>
                </TableRow>
              ) : (
                filteredHotels.map((hotel) => (
                  <TableRow key={hotel.id}>
                    <TableCell className="align-middle">
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
                    <TableCell className="align-middle">
                      <div className="text-sm">
                        {hotel.address} {hotel.postal_code || ''} {hotel.city} {hotel.country}
                      </div>
                    </TableCell>
                    <TableCell className="align-middle">
                      {hotel.concierges && hotel.concierges.length > 0 ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          {hotel.concierges.map((concierge) => (
                            <div key={concierge.id} className="flex items-center gap-2">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={concierge.profile_image || ""} />
                                <AvatarFallback className="bg-muted text-xs">
                                  {concierge.first_name.charAt(0)}{concierge.last_name.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm whitespace-nowrap">
                                {concierge.first_name} {concierge.last_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <span className="text-sm text-muted-foreground">-</span>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <Badge 
                        variant={hotel.status === "Active" ? "default" : "secondary"}
                        className={cn(
                          "font-medium",
                          hotel.status === "Active" && "bg-green-500/10 text-green-700 hover:bg-green-500/20"
                        )}
                      >
                        {hotel.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <span className="font-medium">€0.00</span>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <span className="text-muted-foreground">0</span>
                    </TableCell>
                    <TableCell className="align-middle">
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
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteHotel}
                className="bg-foreground text-background hover:bg-foreground/90"
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
