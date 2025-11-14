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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Search, Mail, Phone, Star, Plus } from "lucide-react";
import { toast } from "sonner";
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

  const handleDeleteHairDresser = async () => {
    if (!deleteHairDresserId) return;

    const { error } = await supabase
      .from("hairdressers")
      .delete()
      .eq("id", deleteHairDresserId);

    if (error) {
      toast.error("Erreur lors de la suppression du coiffeur");
      return;
    }

    toast.success("Coiffeur supprimé avec succès");
    setIsDeleteDialogOpen(false);
    setDeleteHairDresserId(null);
    fetchHairdressers();
  };

  const getSkillEmoji = (skill: string) => {
    const emojiMap: Record<string, string> = {
      men: "👨",
      women: "👩",
      barber: "💈",
      beauty: "💅",
    };
    return emojiMap[skill] || skill;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-8 flex items-center gap-2">
            💇 Coiffeurs
          </h1>

          <div className="flex gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={hotelFilter} onValueChange={setHotelFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by hotel" />
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
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="Actif">Actif</SelectItem>
                <SelectItem value="En attente">En attente</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Ajouter
            </Button>
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Personne</TableHead>
                <TableHead className="font-semibold">Email</TableHead>
                <TableHead className="font-semibold">Numéro de téléphone</TableHead>
                <TableHead className="font-semibold">Hôtels</TableHead>
                <TableHead className="font-semibold">Box</TableHead>
                <TableHead className="font-semibold">Compétences</TableHead>
                <TableHead className="font-semibold">Statut</TableHead>
                <TableHead className="font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHairdressers.map((hairdresser) => (
                <TableRow key={hairdresser.id}>
                  <TableCell className="align-middle">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={hairdresser.profile_image || ""} />
                        <AvatarFallback>
                          {hairdresser.first_name[0]}
                          {hairdresser.last_name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">
                        {hairdresser.first_name} {hairdresser.last_name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="align-middle">
                    <a
                      href={`mailto:${hairdresser.email}`}
                      className="text-primary hover:underline"
                    >
                      {hairdresser.email}
                    </a>
                  </TableCell>
                  <TableCell className="align-middle">
                    {hairdresser.country_code} {hairdresser.phone}
                  </TableCell>
                  <TableCell className="align-middle">
                    <div className="flex flex-wrap gap-2">
                      {hairdresser.hairdresser_hotels?.map((hh) => {
                        const hotel = hotels.find((h) => h.id === hh.hotel_id);
                        if (!hotel) return null;
                        return (
                          <div key={hotel.id} className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={hotel.image || ""} />
                              <AvatarFallback>{hotel.name[0]}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{hotel.name}</span>
                          </div>
                        );
                      })}
                      {(!hairdresser.hairdresser_hotels || hairdresser.hairdresser_hotels.length === 0) && "-"}
                    </div>
                  </TableCell>
                  <TableCell className="align-middle">
                    {hairdresser.boxes || "-"}
                  </TableCell>
                  <TableCell className="align-middle">
                    <div className="flex gap-1">
                      {hairdresser.skills && hairdresser.skills.length > 0
                        ? hairdresser.skills.map((skill, index) => (
                            <span key={index} className="text-lg" title={skill}>
                              {getSkillEmoji(skill)}
                            </span>
                          ))
                        : "-"}
                    </div>
                  </TableCell>
                  <TableCell className="align-middle">
                    <Badge
                      variant={
                        hairdresser.status === "Actif" ? "default" : "secondary"
                      }
                      className={
                        hairdresser.status === "Actif"
                          ? "bg-green-500 hover:bg-green-600"
                          : "bg-orange-500 hover:bg-orange-600"
                      }
                    >
                      {hairdresser.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-middle">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedHairDresser(hairdresser);
                          setIsEditDialogOpen(true);
                        }}
                      >
                        Modifier
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setDeleteHairDresserId(hairdresser.id);
                          setIsDeleteDialogOpen(true);
                        }}
                      >
                        Supprimer
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
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
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer ce coiffeur ? Cette action est
              irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteHairDresser}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
