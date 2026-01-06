import { useState, useEffect } from "react";
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
import { formatPrice } from "@/lib/formatPrice";
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
  }, []);

  const isAdmin = userRole === "admin";

  const { data: menus, refetch } = useQuery({
    queryKey: ["treatment-menus"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatment_menus")
        .select("*")
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });

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

  const formatLeadTime = (minutes: number | null) => {
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
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            💆 Menus de soins
          </h1>
          {isAdmin && (
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Ajouter une prestation
            </Button>
          )}
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

            {isAdmin && (
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
            )}

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrer par statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="active">Actif</SelectItem>
                <SelectItem value="inactive">Inactif</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Table className="text-xs w-full table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/20 h-8">
                <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate w-[180px]">Prestation</TableHead>
                <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate text-center w-[70px]">Durée</TableHead>
                <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate text-center w-[60px]">Tarif</TableHead>
                <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate text-center w-[70px]">Délai</TableHead>
                <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate text-center w-[70px]">Public</TableHead>
                <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate text-center w-[90px]">Catégorie</TableHead>
                <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate text-center w-[100px]">Établissement</TableHead>
                <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate text-center w-[70px]">Statut</TableHead>
                {isAdmin && <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate text-center w-[70px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMenus?.map((menu) => {
                const hotel = getHotelInfo(menu.hotel_id);
                return (
                  <TableRow key={menu.id} className="cursor-pointer hover:bg-muted/50 transition-colors h-10 max-h-10">
                    <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        {menu.image ? (
                          <img
                            src={menu.image}
                            alt={menu.name}
                            className="w-6 h-6 rounded object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded bg-muted flex items-center justify-center text-muted-foreground flex-shrink-0 text-xs">
                            💆
                          </div>
                        )}
                        <span className="truncate font-medium text-foreground">{menu.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden text-center">
                      <span className="truncate block text-foreground">
                        {menu.price_on_request ? "Sur demande" : formatDuration(menu.duration)}
                      </span>
                    </TableCell>
                    <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden text-center">
                      <span className="truncate block text-foreground">
                        {menu.price_on_request ? "Sur demande" : formatPrice(menu.price, 'EUR', { decimals: 0 })}
                      </span>
                    </TableCell>
                    <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden text-center">
                      <span className="truncate block text-foreground">{formatLeadTime(menu.lead_time)}</span>
                    </TableCell>
                    <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden text-center">
                      <span className="text-xs">
                        {menu.service_for === "Male"
                          ? "👨"
                          : menu.service_for === "Female"
                          ? "👩"
                          : "👥"}
                      </span>
                    </TableCell>
                    <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden text-center">
                      <span className="truncate block text-foreground">{menu.category}</span>
                    </TableCell>
                    <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden text-center">
                      {hotel ? (
                        <div className="flex items-center justify-center gap-1">
                          {hotel.image && (
                            <img
                              src={hotel.image}
                              alt={hotel.name}
                              className="w-4 h-4 rounded object-cover"
                            />
                          )}
                          <span className="truncate text-foreground">{hotel.name}</span>
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden text-center">
                      <Badge
                        variant={menu.status === "active" ? "default" : "secondary"}
                        className={cn(
                          "text-[10px] px-2 py-0.5",
                          menu.status === "active" &&
                            "bg-green-500/10 text-green-700 hover:bg-green-500/20",
                          menu.status === "inactive" &&
                            "bg-red-500/10 text-red-700 hover:bg-red-500/20"
                        )}
                      >
                        {menu.status === "active" ? "Actif" : "Inactif"}
                      </Badge>
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              setMenuToEdit(menu);
                              setEditDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              setMenuToDelete(menu.id);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
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
