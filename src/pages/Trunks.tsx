import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Search, Pencil, Trash2, Plus } from "lucide-react";
import { AddTrunkDialog } from "@/components/AddTrunkDialog";
import { EditTrunkDialog } from "@/components/EditTrunkDialog";
import { StatusBadge } from "@/components/StatusBadge";
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

export default function Trunks() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [hotelFilter, setHotelFilter] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedTrunk, setSelectedTrunk] = useState<any>(null);
  const queryClient = useQueryClient();
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

  const { data: trunks, isLoading } = useQuery({
    queryKey: ["trunks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trunks")
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
        .select("id, name")
        .order("name");

      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("trunks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trunks"] });
      toast.success("Trunk supprimé avec succès");
      setIsDeleteDialogOpen(false);
      setSelectedTrunk(null);
    },
    onError: () => {
      toast.error("Erreur lors de la suppression du trunk");
    },
  });

  const filteredTrunks = trunks?.filter((trunk) => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch =
      trunk.name?.toLowerCase().includes(searchLower) ||
      trunk.trunk_model?.toLowerCase().includes(searchLower);
    
    const matchesStatus = statusFilter === "all" || trunk.status === statusFilter;
    const matchesHotel = hotelFilter === "all" || trunk.hotel_id === hotelFilter;

    return matchesSearch && matchesStatus && matchesHotel;
  });

  const handleEdit = (trunk: any) => {
    setSelectedTrunk(trunk);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (trunk: any) => {
    setSelectedTrunk(trunk);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedTrunk) {
      deleteMutation.mutate(selectedTrunk.id);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            🧳 Trunks (Malles)
          </h1>
          {isAdmin && (
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Ajouter un trunk
            </Button>
          )}
        </div>

        <div className="bg-card rounded-lg border border-border">
          <div className="p-4 border-b border-border">
            <div className="flex gap-4 flex-wrap items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Tous les statuts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="active">Actif</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>

              <Select value={hotelFilter} onValueChange={setHotelFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Tous les hôtels" />
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
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Modèle</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Hôtel</TableHead>
                  <TableHead>Coiffeur</TableHead>
                  <TableHead>Prochaine réservation</TableHead>
                  <TableHead>Statut</TableHead>
                  {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center">
                      Chargement...
                    </TableCell>
                  </TableRow>
                ) : filteredTrunks && filteredTrunks.length > 0 ? (
                  filteredTrunks.map((trunk) => (
                    <TableRow key={trunk.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {trunk.image ? (
                            <img
                              src={trunk.image}
                              alt={trunk.name}
                              className="h-10 w-10 rounded-md object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                              🧳
                            </div>
                          )}
                          <span className="font-medium">{trunk.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{trunk.trunk_model}</TableCell>
                      <TableCell>{trunk.trunk_id}</TableCell>
                      <TableCell>{trunk.hotel_name || "-"}</TableCell>
                      <TableCell>{trunk.hairdresser_name || "-"}</TableCell>
                      <TableCell>
                        {trunk.next_booking
                          ? new Date(trunk.next_booking).toLocaleString("fr-FR")
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={trunk.status} type="entity" />
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(trunk)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(trunk)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center">
                      Aucun trunk trouvé
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <AddTrunkDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["trunks"] });
        }}
      />

      {selectedTrunk && (
        <EditTrunkDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          trunk={selectedTrunk}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["trunks"] });
          }}
        />
      )}

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer ce trunk ? Cette action est
              irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
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
