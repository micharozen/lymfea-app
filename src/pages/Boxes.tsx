import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search, Pencil, Trash2, Plus } from "lucide-react";
import { AddBoxDialog } from "@/components/AddBoxDialog";
import { EditBoxDialog } from "@/components/EditBoxDialog";
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

export default function Boxes() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [hotelFilter, setHotelFilter] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedBox, setSelectedBox] = useState<any>(null);
  const queryClient = useQueryClient();

  const { data: boxes, isLoading } = useQuery({
    queryKey: ["boxes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("boxes")
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
      const { error } = await supabase.from("boxes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["boxes"] });
      toast.success("Box supprimée avec succès");
      setIsDeleteDialogOpen(false);
      setSelectedBox(null);
    },
    onError: () => {
      toast.error("Erreur lors de la suppression de la box");
    },
  });

  const filteredBoxes = boxes?.filter((box) => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch =
      box.name?.toLowerCase().includes(searchLower) ||
      box.box_model?.toLowerCase().includes(searchLower);
    
    const matchesStatus = statusFilter === "all" || box.status === statusFilter;
    const matchesHotel = hotelFilter === "all" || box.hotel_id === hotelFilter;

    return matchesSearch && matchesStatus && matchesHotel;
  });

  const handleEdit = (box: any) => {
    setSelectedBox(box);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (box: any) => {
    setSelectedBox(box);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedBox) {
      deleteMutation.mutate(selectedBox.id);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            📦 Boxes
          </h1>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Ajouter une box
          </Button>
        </div>

        <div className="bg-card rounded-lg border border-border">
          <div className="p-4 border-b border-border">
            <div className="flex gap-4 flex-wrap items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search"
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
                  <SelectItem value="Actif">Actif</SelectItem>
                  <SelectItem value="Inactif">Inactif</SelectItem>
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
                  <TableHead>Modèle de box</TableHead>
                  <TableHead>Id</TableHead>
                  <TableHead>Hôtel</TableHead>
                  <TableHead>Coiffeur</TableHead>
                  <TableHead>Prochaine réservation</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center">
                      Chargement...
                    </TableCell>
                  </TableRow>
                ) : filteredBoxes && filteredBoxes.length > 0 ? (
                  filteredBoxes.map((box) => (
                    <TableRow key={box.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {box.image ? (
                            <img
                              src={box.image}
                              alt={box.name}
                              className="h-10 w-10 rounded-md object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                              📦
                            </div>
                          )}
                          <span className="font-medium">{box.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{box.box_model}</TableCell>
                      <TableCell>{box.box_id}</TableCell>
                      <TableCell>{box.hotel_name || "-"}</TableCell>
                      <TableCell>{box.hairdresser_name || "-"}</TableCell>
                      <TableCell>
                        {box.next_booking
                          ? new Date(box.next_booking).toLocaleString("fr-FR")
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            box.status === "Actif"
                              ? "bg-green-500/10 text-green-700 hover:bg-green-500/10"
                              : "bg-orange-500/10 text-orange-700 hover:bg-orange-500/10"
                          }
                        >
                          {box.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(box)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(box)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center">
                      Aucune box trouvée
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <AddBoxDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["boxes"] });
        }}
      />

      {selectedBox && (
        <EditBoxDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          box={selectedBox}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["boxes"] });
          }}
        />
      )}

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer cette box ? Cette action est
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
