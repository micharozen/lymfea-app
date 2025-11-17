import { useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import AddHairDresserDialog from "@/components/AddHairDresserDialog";
import EditHairDresserDialog from "@/components/EditHairDresserDialog";

interface Hotel {
  id: string;
  name: string;
  image: string | null;
}

interface HairDresser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  country_code: string;
  phone: string;
  profile_image: string | null;
  status: string;
  boxes: string | null;
  skills: string[];
  hairdresser_hotels?: { hotel_id: string }[];
}

export default function HairDresser() {
  const [hairdressers, setHairdressers] = useState<HairDresser[]>([]);
  const [filteredHairdressers, setFilteredHairdressers] = useState<HairDresser[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [hotelFilter, setHotelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedHairDresser, setSelectedHairDresser] = useState<HairDresser | null>(null);
  const [deleteHairDresserId, setDeleteHairDresserId] = useState<string | null>(null);

  useEffect(() => {
    fetchHairdressers();
    fetchHotels();
  }, []);

  useEffect(() => {
    filterHairdressers();
  }, [searchQuery, hotelFilter, statusFilter, hairdressers]);

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

  const fetchHairdressers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("hairdressers")
      .select(`
        *,
        hairdresser_hotels(hotel_id)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erreur lors du chargement des coiffeurs");
      setLoading(false);
      return;
    }

    setHairdressers(data || []);
    setLoading(false);
  };

  const filterHairdressers = () => {
    let filtered = hairdressers;

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
        hd.hairdresser_hotels?.some((hh) => hh.hotel_id === hotelFilter)
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((hd) => hd.status === statusFilter);
    }

    setFilteredHairdressers(filtered);
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const getHotelNames = (hairdresserHotels?: { hotel_id: string }[]) => {
    if (!hairdresserHotels || hairdresserHotels.length === 0) {
      return "Non assigné";
    }
    
    const names = hairdresserHotels
      .map((hh) => {
        const hotel = hotels.find((h) => h.id === hh.hotel_id);
        return hotel?.name;
      })
      .filter(Boolean);
    
    return names.length > 0 ? names.join(", ") : "Non assigné";
  };

  const getSkillsDisplay = (skills: string[]) => {
    if (!skills || skills.length === 0) return "-";
    
    const skillMap: Record<string, string> = {
      men: "👨",
      women: "👩",
      barber: "💈",
      beauty: "💅",
    };

    return skills.map((skill) => skillMap[skill] || skill).join(" ");
  };

  const handleDelete = async () => {
    if (!deleteHairDresserId) return;

    const { error } = await supabase
      .from("hairdressers")
      .delete()
      .eq("id", deleteHairDresserId);

    if (error) {
      toast.error("Erreur lors de la suppression");
      return;
    }

    toast.success("Coiffeur supprimé avec succès");
    setIsDeleteDialogOpen(false);
    setDeleteHairDresserId(null);
    fetchHairdressers();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Coiffeurs</h1>
          <p className="text-muted-foreground mt-2">
            Gérez vos coiffeurs et leurs informations
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Rechercher par nom, email ou téléphone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

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

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tous les statuts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="Actif">Actif</SelectItem>
                <SelectItem value="En attente">En attente</SelectItem>
              </SelectContent>
            </Select>

            <Button
              className="ml-auto bg-foreground text-background hover:bg-foreground/90"
              onClick={() => setIsAddDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Ajouter un coiffeur
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Nom</TableHead>
                <TableHead className="font-semibold">Email</TableHead>
                <TableHead className="font-semibold">Numéro de téléphone</TableHead>
                <TableHead className="font-semibold">Hôtels</TableHead>
                <TableHead className="font-semibold">Box</TableHead>
                <TableHead className="font-semibold">Compétences</TableHead>
                <TableHead className="font-semibold">Statut</TableHead>
                <TableHead className="font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHairdressers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    Aucun coiffeur trouvé
                  </TableCell>
                </TableRow>
              ) : (
                filteredHairdressers.map((hairdresser) => (
                  <TableRow key={hairdresser.id}>
                    <TableCell className="align-middle">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                          {hairdresser.profile_image ? (
                            <img
                              src={hairdresser.profile_image}
                              alt="Profile"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-xs font-medium text-muted-foreground">
                              {getInitials(hairdresser.first_name, hairdresser.last_name)}
                            </span>
                          )}
                        </div>
                        <span className="font-medium">
                          {hairdresser.first_name} {hairdresser.last_name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="align-middle">
                      <span className="text-sm">{hairdresser.email}</span>
                    </TableCell>
                    <TableCell className="align-middle">
                      <span className="text-sm">
                        {hairdresser.country_code} {hairdresser.phone}
                      </span>
                    </TableCell>
                    <TableCell className="align-middle">
                      <span className="text-sm">{getHotelNames(hairdresser.hairdresser_hotels)}</span>
                    </TableCell>
                    <TableCell className="align-middle">
                      <span className="text-sm">{hairdresser.boxes || "-"}</span>
                    </TableCell>
                    <TableCell className="align-middle">
                      <span className="text-lg">{getSkillsDisplay(hairdresser.skills)}</span>
                    </TableCell>
                    <TableCell className="align-middle">
                      <Badge
                        variant={hairdresser.status === "Actif" ? "default" : "secondary"}
                        className={cn(
                          "font-medium",
                          hairdresser.status === "Actif" && "bg-green-500/10 text-green-700 hover:bg-green-500/20",
                          hairdresser.status === "En attente" && "bg-orange-500/10 text-orange-700 hover:bg-orange-500/20"
                        )}
                      >
                        {hairdresser.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-middle">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedHairDresser(hairdresser);
                            setIsEditDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setDeleteHairDresserId(hairdresser.id);
                            setIsDeleteDialogOpen(true);
                          }}
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
      </div>

      <AddHairDresserDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSuccess={fetchHairdressers}
      />

      {selectedHairDresser && (
        <EditHairDresserDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          hairdresser={selectedHairDresser}
          onSuccess={fetchHairdressers}
        />
      )}

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Êtes-vous sûr ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le coiffeur sera définitivement supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
