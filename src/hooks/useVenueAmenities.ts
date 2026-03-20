import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getAmenityDefaultColor } from "@/lib/amenityTypes";

export interface VenueAmenity {
  id: string;
  hotel_id: string;
  type: string;
  is_enabled: boolean;
  name: string | null;
  color: string;
  capacity_per_slot: number;
  slot_duration: number;
  prep_time: number;
  price_external: number;
  price_lymfea: number;
  lymfea_access_included: boolean;
  lymfea_access_duration: number | null;
  currency: string;
  opening_time: string | null;
  closing_time: string | null;
  created_at: string;
  updated_at: string;
}

export type VenueAmenityInsert = {
  hotel_id: string;
  type: string;
  is_enabled?: boolean;
  name?: string | null;
  color?: string;
  capacity_per_slot?: number;
  slot_duration?: number;
  prep_time?: number;
  price_external?: number;
  price_lymfea?: number;
  lymfea_access_included?: boolean;
  lymfea_access_duration?: number | null;
  currency?: string;
  opening_time?: string | null;
  closing_time?: string | null;
};

export type VenueAmenityUpdate = Partial<Omit<VenueAmenityInsert, "hotel_id" | "type">>;

export function useVenueAmenities(hotelId: string) {
  const queryClient = useQueryClient();
  const queryKey = ["venue-amenities", hotelId];

  const { data: amenities = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venue_amenities")
        .select("*")
        .eq("hotel_id", hotelId)
        .order("type");
      if (error) throw error;
      return data as VenueAmenity[];
    },
    enabled: !!hotelId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
  };

  const createMutation = useMutation({
    mutationFn: async (input: VenueAmenityInsert) => {
      const { data, error } = await supabase.from("venue_amenities").insert({
        ...input,
        color: input.color || getAmenityDefaultColor(input.type),
      }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Commodité ajoutée");
    },
    onError: () => {
      toast.error("Erreur lors de l'ajout");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: VenueAmenityUpdate }) => {
      const { error } = await supabase
        .from("venue_amenities")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Commodité mise à jour");
    },
    onError: () => {
      toast.error("Erreur lors de la mise à jour");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_enabled }: { id: string; is_enabled: boolean }) => {
      const { error } = await supabase
        .from("venue_amenities")
        .update({ is_enabled })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
    },
    onError: () => {
      toast.error("Erreur lors de la mise à jour");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("venue_amenities")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Commodité supprimée");
    },
    onError: () => {
      toast.error("Erreur lors de la suppression");
    },
  });

  const enabledAmenities = amenities.filter((a) => a.is_enabled);
  const enabledTypes = amenities.map((a) => a.type);

  return {
    amenities,
    enabledAmenities,
    enabledTypes,
    isLoading,
    create: createMutation.mutate,
    createAsync: createMutation.mutateAsync,
    update: updateMutation.mutate,
    toggle: toggleMutation.mutate,
    remove: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}
