import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Search, Pencil, Trash2, MapPin, Users, Package, DollarSign, Calendar } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/formatPrice";
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
import { HotelQRCode } from "@/components/HotelQRCode";

interface Concierge {
  id: string;
  first_name: string;
  last_name: string;
  profile_image: string | null;
}

interface Trunk {
  id: string;
  name: string;
  trunk_id: string;
  image: string | null;
}

interface HotelStats {
  bookingsCount: number;
  totalSales: number;
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
  trunks?: Trunk[];
  stats?: HotelStats;
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
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    fetchHotels();
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

      // Fetch all trunks
      const { data: trunksData, error: trunksError } = await supabase
        .from("trunks")
        .select("id, name, trunk_id, image, hotel_id");

      if (trunksError) throw trunksError;

      // Fetch bookings stats per hotel (completed bookings only for sales)
      const { data: bookingsData, error: bookingsError } = await supabase
        .from("bookings")
        .select("hotel_id, total_price, status");

      if (bookingsError) throw bookingsError;

      // Calculate stats per hotel
      const hotelStats: Record<string, HotelStats> = {};
      (bookingsData || []).forEach((booking) => {
        if (!hotelStats[booking.hotel_id]) {
          hotelStats[booking.hotel_id] = { bookingsCount: 0, totalSales: 0 };
        }
        hotelStats[booking.hotel_id].bookingsCount += 1;
        // Only count completed bookings for sales
        if (booking.status === "completed" && booking.total_price) {
          hotelStats[booking.hotel_id].totalSales += Number(booking.total_price);
        }
      });

      // Map concierges, trunks and stats to hotels
      const hotelsWithData = (hotelsData || []).map((hotel) => {
        const hotelConcierges = (conciergeMappings || [])
          .filter((mapping) => mapping.hotel_id === hotel.id)
          .map((mapping) => {
            return (conciergesData || []).find((c) => c.id === mapping.concierge_id);
          })
          .filter((c): c is Concierge => c !== undefined);

        const hotelTrunks = (trunksData || [])
          .filter((trunk) => trunk.hotel_id === hotel.id)
          .map((trunk): Trunk => ({
            id: trunk.id,
            name: trunk.name,
            trunk_id: trunk.trunk_id,
            image: trunk.image,
          }));

        return {
          ...hotel,
          concierges: hotelConcierges,
          trunks: hotelTrunks,
          stats: hotelStats[hotel.id] || { bookingsCount: 0, totalSales: 0 },
        };
      });

      setHotels(hotelsWithData);
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
              <SelectItem value="Actif">Actif</SelectItem>
              <SelectItem value="En attente">En attente</SelectItem>
            </SelectContent>
          </Select>

          <Button 
            className="ml-auto bg-foreground text-background hover:bg-foreground/90"
            onClick={() => setShowAddDialog(true)}
            style={{ display: isAdmin ? 'flex' : 'none' }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Ajouter un hôtel
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <Table className="text-xs w-full table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/20 h-8">
                <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Hôtel</TableHead>
                <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Localisation</TableHead>
                <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Concierges</TableHead>
                <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Trunks</TableHead>
                <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Statut</TableHead>
                <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Ventes</TableHead>
                <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Rés.</TableHead>
                <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">QR</TableHead>
                {isAdmin && (
                  <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate text-right">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHotels.length === 0 ? (
                <TableRow className="h-10 max-h-10">
                  <TableCell colSpan={9} className="py-0 px-2 h-10 text-center text-muted-foreground">
                    Aucun hôtel trouvé
                  </TableCell>
                </TableRow>
              ) : (
                filteredHotels.map((hotel) => (
                  <TableRow key={hotel.id} className="cursor-pointer hover:bg-muted/50 transition-colors h-10 max-h-10">
                    <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        {hotel.image ? (
                          <img
                            src={hotel.image}
                            alt={hotel.name}
                            className="w-6 h-6 rounded object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded bg-muted flex items-center justify-center flex-shrink-0 text-[10px] font-medium text-muted-foreground">
                            {hotel.name.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span className="truncate font-medium text-foreground">{hotel.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                      <span className="truncate block text-foreground">
                        {hotel.city}{hotel.country ? `, ${hotel.country}` : ''}
                      </span>
                    </TableCell>
                    <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                      {hotel.concierges && hotel.concierges.length > 0 ? (
                        <div className="flex items-center gap-1">
                          {hotel.concierges.slice(0, 2).map((concierge) => (
                            <div key={concierge.id} className="w-4 h-4 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                              {concierge.profile_image ? (
                                <img src={concierge.profile_image} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[6px] font-medium text-muted-foreground">
                                  {concierge.first_name.charAt(0)}{concierge.last_name.charAt(0)}
                                </span>
                              )}
                            </div>
                          ))}
                          {hotel.concierges.length > 2 && (
                            <span className="text-[10px] text-muted-foreground">+{hotel.concierges.length - 2}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                      {hotel.trunks && hotel.trunks.length > 0 ? (
                        <div className="flex items-center gap-1">
                          {hotel.trunks.slice(0, 2).map((trunk) => (
                            <div key={trunk.id} className="w-4 h-4 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                              {trunk.image ? (
                                <img src={trunk.image} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[6px] font-medium text-muted-foreground">
                                  {trunk.trunk_id.substring(0, 2).toUpperCase()}
                                </span>
                              )}
                            </div>
                          ))}
                          {hotel.trunks.length > 2 && (
                            <span className="text-[10px] text-muted-foreground">+{hotel.trunks.length - 2}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                      <Badge 
                        variant={(hotel.status?.toLowerCase() === "actif" || hotel.status?.toLowerCase() === "active") ? "default" : "secondary"}
                        className={cn(
                          "text-[10px] px-2 py-0.5 whitespace-nowrap",
                          (hotel.status?.toLowerCase() === "actif" || hotel.status?.toLowerCase() === "active") && "bg-green-500/10 text-green-700",
                          hotel.status === "En attente" && "bg-orange-500/10 text-orange-700"
                        )}
                      >
                        {(hotel.status?.toLowerCase() === "active" || hotel.status?.toLowerCase() === "actif") ? "Actif" : hotel.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                      <span className="truncate block text-foreground font-medium">{formatPrice(hotel.stats?.totalSales || 0, hotel.currency)}</span>
                    </TableCell>
                    <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                      <span className="truncate block text-foreground">{hotel.stats?.bookingsCount || 0}</span>
                    </TableCell>
                    <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                      <HotelQRCode hotelId={hotel.id} hotelName={hotel.name} />
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setEditHotelId(hotel.id)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setDeleteHotelId(hotel.id)}
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
