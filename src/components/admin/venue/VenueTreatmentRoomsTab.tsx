import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFileUpload } from "@/hooks/useFileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MultiSelectPopover } from "@/components/MultiSelectPopover";
import { toast } from "sonner";
import { Plus, Trash2, X, Check, ChevronDown, Upload, Loader2, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

const ROOM_TYPES = [
  { value: "Massage", label: "Massage" },
  { value: "Facial", label: "Soin visage" },
  { value: "Hammam", label: "Hammam" },
  { value: "Jacuzzi", label: "Jacuzzi" },
  { value: "Sauna", label: "Sauna" },
  { value: "Body Wrap", label: "Enveloppement" },
  { value: "Multi-purpose", label: "Polyvalente" },
];

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
  const [newRoomType, setNewRoomType] = useState("");
  const [typePopoverOpen, setTypePopoverOpen] = useState(false);
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
        room_type: newRoomType,
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
      setNewRoomType("");
      setNewRoomImage("");
      setShowCreateForm(false);
      toast.success("Salle créée et assignée");
    },
    onError: () => {
      toast.error("Erreur lors de la création");
    },
  });

  const handleCreate = () => {
    if (!newRoomName.trim() || !newRoomType) {
      toast.error("Veuillez remplir le nom et le type de la salle");
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
                    {ROOM_TYPES.find((t) => t.value === room.room_type)?.label || room.room_type}
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

            <div className="grid grid-cols-2 gap-4">
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
                <Label className="text-xs">Type *</Label>
                <Popover open={typePopoverOpen} onOpenChange={setTypePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-between font-normal h-9 text-sm hover:bg-background hover:text-foreground",
                        !newRoomType && "text-muted-foreground"
                      )}
                    >
                      <span className="truncate">
                        {ROOM_TYPES.find((t) => t.value === newRoomType)?.label || "Sélectionner"}
                      </span>
                      <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-0" align="start">
                    <ScrollArea className="h-48">
                      <div className="p-1">
                        {ROOM_TYPES.map((type) => {
                          const isSelected = newRoomType === type.value;
                          return (
                            <button
                              key={type.value}
                              type="button"
                              onClick={() => {
                                setNewRoomType(type.value);
                                setTypePopoverOpen(false);
                              }}
                              className={cn(
                                "w-full grid grid-cols-[1fr_auto] items-center gap-2 rounded-sm",
                                "px-3 py-1.5 text-sm text-popover-foreground transition-colors",
                                "hover:bg-foreground/5",
                                isSelected && "font-medium"
                              )}
                            >
                              <span className="min-w-0 truncate text-left">{type.label}</span>
                              {isSelected ? (
                                <span className="h-4 w-4 grid place-items-center rounded-sm bg-primary text-primary-foreground">
                                  <Check className="h-3 w-3" strokeWidth={3} />
                                </span>
                              ) : (
                                <span className="h-4 w-4" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewRoomName("");
                  setNewRoomType("");
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
