import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Search, Pencil, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
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
import { AddTreatmentMenuDialog } from "@/components/AddTreatmentMenuDialog";
import { EditTreatmentMenuDialog } from "@/components/EditTreatmentMenuDialog";

export default function TreatmentMenus() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [hotelFilter, setHotelFilter] = useState<string>("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [menuToDelete, setMenuToDelete] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [menuToEdit, setMenuToEdit] = useState<any>(null);

  const { data: menus, refetch } = useQuery({
    queryKey: ["treatment-menus"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatment_menus")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const { data: hotels } = useQuery({
    queryKey: ["hotels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotels")
        .select("*")
        .order("name");

      if (error) throw error;
      return data;
    },
  });

  const filteredMenus = menus?.filter((menu) => {
    const matchesSearch =
      menu.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      menu.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || menu.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || menu.category === categoryFilter;
    const matchesHotel = hotelFilter === "all" || menu.hotel_id === hotelFilter;

    return matchesSearch && matchesStatus && matchesCategory && matchesHotel;
  });

  const categories = Array.from(
    new Set(menus?.map((menu) => menu.category).filter(Boolean))
  );

  const handleDelete = async () => {
    if (!menuToDelete) return;

    const { error } = await supabase
      .from("treatment_menus")
      .delete()
      .eq("id", menuToDelete);

    if (error) {
      toast.error("Erreur lors de la suppression du menu");
      return;
    }

    toast.success("Menu supprimé avec succès");
    setDeleteDialogOpen(false);
    setMenuToDelete(null);
    refetch();
  };

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return "0";
    return `${minutes}min`;
  };

  const formatBufferTime = (minutes: number | null) => {
    if (!minutes) return "0";
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0 ? `${hours}h${remainingMinutes}` : `${hours}hr${hours > 1 ? 's' : ''}`;
    }
    return `${minutes}min`;
  };

  const getHotelInfo = (hotelId: string | null) => {
    if (!hotelId || !hotels) return null;
    return hotels.find((h) => h.id === hotelId);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-[1600px] mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-8 flex items-center gap-2">
            💆 Menus de soins
          </h1>
        </div>

        <div className="bg-card rounded-lg border border-border">
          <div className="p-6 border-b border-border flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrer par catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les catégories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={hotelFilter} onValueChange={setHotelFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrer par hôtel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les hôtels</SelectItem>
                {hotels?.map((hotel) => (
                  <SelectItem key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrer par statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="Actif">Actif</SelectItem>
                <SelectItem value="En attente">En attente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">
                  <div className="flex items-center justify-between">
                    Prestation
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setAddDialogOpen(true)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Durée</TableHead>
                <TableHead className="text-center">Tarif</TableHead>
                <TableHead className="text-center">Intervalle</TableHead>
                <TableHead className="text-center">Public</TableHead>
                <TableHead className="text-center">Catégorie</TableHead>
                <TableHead className="text-center">Établissement</TableHead>
                <TableHead className="text-center">Statut</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMenus?.map((menu) => {
                const hotel = getHotelInfo(menu.hotel_id);
                return (
                  <TableRow key={menu.id}>
                    <TableCell className="align-middle">
                      <div className="flex items-center gap-3">
                        {menu.image ? (
                          <img
                            src={menu.image}
                            alt={menu.name}
                            className="w-10 h-10 rounded object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-muted-foreground">
                            💆
                          </div>
                        )}
                        <span className="font-medium">{menu.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="align-middle max-w-[300px]">
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {menu.description || "-"}
                      </p>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      {formatDuration(menu.duration)}
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      {menu.price ? `${menu.price}€` : "0"}
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      {formatBufferTime(menu.buffer_time)}
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <span className="text-lg">
                        {menu.service_for === "Male"
                          ? "👨"
                          : menu.service_for === "Female"
                          ? "👩"
                          : "👥"}
                      </span>
                      <span className="ml-2 text-sm">{menu.service_for}</span>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      {menu.category}
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      {hotel ? (
                        <div className="flex items-center justify-center gap-2">
                          {hotel.image && (
                            <img
                              src={hotel.image}
                              alt={hotel.name}
                              className="w-6 h-6 rounded object-cover"
                            />
                          )}
                          <span className="text-sm">{hotel.name}</span>
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <Badge
                        variant={menu.status === "Actif" ? "default" : "secondary"}
                        className={cn(
                          "font-medium",
                          menu.status === "Actif" &&
                            "bg-green-500/10 text-green-700 hover:bg-green-500/20",
                          menu.status === "En attente" &&
                            "bg-orange-500/10 text-orange-700 hover:bg-orange-500/20"
                        )}
                      >
                        {menu.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setMenuToEdit(menu);
                            setEditDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setMenuToDelete(menu.id);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer ce menu de soins ? Cette action est
              irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddTreatmentMenuDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={refetch}
      />

      <EditTreatmentMenuDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        menu={menuToEdit}
        onSuccess={refetch}
      />
    </div>
  );
}
