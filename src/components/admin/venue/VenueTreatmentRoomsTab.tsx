import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFileUpload } from "@/hooks/useFileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelectPopover } from "@/components/MultiSelectPopover";
import { toast } from "sonner";
import { Plus, Trash2, X, Check, Upload, Loader2, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROOM_CAPABILITIES } from "@/components/admin/treatment-room/TreatmentRoomGeneralTab";

const ROOM_TYPES = ROOM_CAPABILITIES;

const generateRoomNumber = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'ROOM-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

interface VenueTreatmentRoomsTabProps {
  hotelId: string;
  hotelName: string;
}

export function VenueTreatmentRoomsTab({ hotelId, hotelName }: VenueTreatmentRoomsTabProps) {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomCapabilities, setNewRoomCapabilities] = useState<string[]>([]);
  const [selectedAssignIds, setSelectedAssignIds] = useState<string[]>([]);

  const {
    url: newRoomImage,
    setUrl: setNewRoomImage,
    uploading: isUploading,
    fileInputRef,
    handleUpload: handleImageUpload,
    triggerFileSelect,
  } = useFileUpload({ path: "treatment-rooms/" });

  // Fetch assigned rooms
  const { data: assignedRooms = [], isLoading: loadingAssigned } = useQuery({
    queryKey: ["venue-rooms", hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatment_rooms")
        .select("*")
        .eq("hotel_id", hotelId)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch unassigned rooms
  const { data: unassignedRooms = [] } = useQuery({
    queryKey: ["unassigned-rooms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatment_rooms")
        .select("*")
        .is("hotel_id", null)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["venue-rooms", hotelId] });
    queryClient.invalidateQueries({ queryKey: ["unassigned-rooms"] });
  };

  // Assign rooms mutation
  const assignMutation = useMutation({
    mutationFn: async (roomIds: string[]) => {
      const { error } = await supabase
        .from("treatment_rooms")
        .update({ hotel_id: hotelId, hotel_name: hotelName })
        .in("id", roomIds);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateQueries();
      setSelectedAssignIds([]);
      toast.success("Salle(s) assignée(s)");
    },
    onError: () => {
      toast.error("Erreur lors de l'assignation");
    },
  });

  // Unassign room mutation
  const unassignMutation = useMutation({
    mutationFn: async (roomId: string) => {
      const { error } = await supabase
        .from("treatment_rooms")
        .update({ hotel_id: null, hotel_name: null })
        .eq("id", roomId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateQueries();
      toast.success("Salle désassignée");
    },
    onError: () => {
      toast.error("Erreur lors de la désassignation");
    },
  });

  // Delete room mutation
  const deleteMutation = useMutation({
    mutationFn: async (roomId: string) => {
      const { error } = await supabase
        .from("treatment_rooms")
        .delete()
        .eq("id", roomId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateQueries();
      toast.success("Salle supprimée");
    },
    onError: () => {
      toast.error("Erreur lors de la suppression");
    },
  });

  // Create room mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("treatment_rooms").insert({
        name: newRoomName,
        room_type: newRoomCapabilities[0] || "Multi-purpose",
        capabilities: newRoomCapabilities,
        room_number: generateRoomNumber(),
        hotel_id: hotelId,
        hotel_name: hotelName,
        image: newRoomImage || null,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateQueries();
      setNewRoomName("");
      setNewRoomCapabilities([]);
      setNewRoomImage("");
      setShowCreateForm(false);
      toast.success("Salle créée et assignée");
    },
    onError: () => {
      toast.error("Erreur lors de la création");
    },
  });

  const handleCreate = () => {
    if (!newRoomName.trim() || newRoomCapabilities.length === 0) {
      toast.error("Veuillez remplir le nom et sélectionner au moins un type de soin");
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Assigned rooms list */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Salles assignées ({assignedRooms.length})
        </h3>
        {loadingAssigned ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : assignedRooms.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Aucune salle assignée</p>
        ) : (
          <div className="space-y-2">
            {assignedRooms.map((room) => (
              <div
                key={room.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card"
              >
                {room.image ? (
                  <img
                    src={room.image}
                    alt={room.name}
                    className="w-10 h-10 rounded-md object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{room.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {((room as any).capabilities?.length
                      ? (room as any).capabilities.map((c: string) => ROOM_TYPES.find((t) => t.value === c)?.label || c).join(", ")
                      : ROOM_TYPES.find((t) => t.value === room.room_type)?.label || room.room_type
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => unassignMutation.mutate(room.id)}
                    title="Désassigner"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(room.id)}
                    title="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assign existing rooms */}
      {unassignedRooms.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Assigner des salles existantes
          </h3>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <MultiSelectPopover
                placeholder="Sélectionner des salles"
                selected={selectedAssignIds}
                onChange={setSelectedAssignIds}
                options={unassignedRooms.map((r) => ({ value: r.id, label: r.name }))}
                popoverWidthClassName="w-64"
                popoverMaxHeightClassName="h-48"
              />
            </div>
            <Button
              size="sm"
              disabled={selectedAssignIds.length === 0 || assignMutation.isPending}
              onClick={() => assignMutation.mutate(selectedAssignIds)}
              className="bg-foreground text-background hover:bg-foreground/90"
            >
              {assignMutation.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Assigner
            </Button>
          </div>
        </div>
      )}

      {/* Create new room */}
      <div>
        {!showCreateForm ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreateForm(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Créer une nouvelle salle
          </Button>
        ) : (
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Nouvelle salle</h3>

            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 rounded-md border border-border flex items-center justify-center overflow-hidden bg-muted flex-shrink-0">
                {newRoomImage ? (
                  <img src={newRoomImage} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <Upload className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUploading}
                onClick={triggerFileSelect}
              >
                {isUploading ? "Téléchargement..." : "Image"}
                {isUploading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nom *</Label>
                <Input
                  placeholder="Salle Zen"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Soins compatibles *</Label>
                <div className="flex flex-wrap gap-1.5">
                  {ROOM_TYPES.map((type) => {
                    const isSelected = newRoomCapabilities.includes(type.value);
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => {
                          setNewRoomCapabilities(prev =>
                            isSelected
                              ? prev.filter(c => c !== type.value)
                              : [...prev, type.value]
                          );
                        }}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs border transition-colors",
                          isSelected
                            ? "bg-foreground text-background border-foreground"
                            : "bg-background text-foreground border-border hover:bg-muted"
                        )}
                      >
                        {isSelected && <Check className="h-2.5 w-2.5" />}
                        {type.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewRoomName("");
                  setNewRoomCapabilities([]);
                  setNewRoomImage("");
                }}
              >
                Annuler
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                {createMutation.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Créer
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
