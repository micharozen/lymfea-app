import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface TreatmentCategory {
  id: string;
  name: string;
  name_en: string | null;
  hotel_id: string;
  sort_order: number | null;
  is_addon: boolean;
  created_at: string;
  updated_at: string;
}

export function useTreatmentCategories(hotelId: string | null | undefined) {
  const queryClient = useQueryClient();

  const { data: categories, isLoading, refetch } = useQuery({
    queryKey: ["treatment-categories", hotelId],
    queryFn: async () => {
      if (!hotelId) return [];

      const { data, error } = await supabase
        .from("treatment_categories")
        .select("*")
        .eq("hotel_id", hotelId)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });

      if (error) throw error;
      return data as TreatmentCategory[];
    },
    enabled: !!hotelId,
  });

  const addCategoryMutation = useMutation({
    mutationFn: async ({ name, hotelId }: { name: string; hotelId: string }) => {
      const maxSortOrder = categories?.reduce(
        (max, cat) => Math.max(max, cat.sort_order || 0),
        0
      ) || 0;

      const { data, error } = await supabase
        .from("treatment_categories")
        .insert({
          name,
          hotel_id: hotelId,
          sort_order: maxSortOrder + 1,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-categories", hotelId] });
      toast.success("Catégorie ajoutée");
    },
    onError: (error: any) => {
      if (error.code === "23505") {
        toast.error("Cette catégorie existe déjà");
      } else {
        toast.error("Erreur lors de l'ajout de la catégorie");
      }
    },
  });

  const renameCategoryMutation = useMutation({
    mutationFn: async ({
      categoryId,
      oldName,
      newName,
      hotelId,
    }: {
      categoryId: string;
      oldName: string;
      newName: string;
      hotelId: string;
    }) => {
      // 1. Update the category record
      const { error: categoryError } = await supabase
        .from("treatment_categories")
        .update({ name: newName })
        .eq("id", categoryId);

      if (categoryError) throw categoryError;

      // 2. Cascade update to all treatments with the old category name
      const { error: treatmentsError } = await supabase
        .from("treatment_menus")
        .update({ category: newName })
        .eq("category", oldName)
        .eq("hotel_id", hotelId);

      if (treatmentsError) throw treatmentsError;

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-categories", hotelId] });
      queryClient.invalidateQueries({ queryKey: ["treatment-menus"] });
      toast.success("Catégorie renommée");
    },
    onError: (error: any) => {
      if (error.code === "23505") {
        toast.error("Une catégorie avec ce nom existe déjà");
      } else {
        toast.error("Erreur lors du renommage de la catégorie");
      }
    },
  });

  const updateNameEnMutation = useMutation({
    mutationFn: async ({
      categoryId,
      nameEn,
    }: {
      categoryId: string;
      nameEn: string | null;
    }) => {
      const { error } = await supabase
        .from("treatment_categories")
        .update({ name_en: nameEn })
        .eq("id", categoryId);

      if (error) throw error;
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-categories", hotelId] });
      toast.success("Traduction enregistrée");
    },
    onError: () => {
      toast.error("Erreur lors de la mise à jour");
    },
  });

  const toggleAddonMutation = useMutation({
    mutationFn: async ({
      categoryId,
      isAddon,
    }: {
      categoryId: string;
      isAddon: boolean;
    }) => {
      const { error } = await supabase
        .from("treatment_categories")
        .update({ is_addon: isAddon })
        .eq("id", categoryId);

      if (error) throw error;
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-categories", hotelId] });
    },
    onError: () => {
      toast.error("Erreur lors de la mise à jour");
    },
  });

  const updateSortOrderMutation = useMutation({
    mutationFn: async ({
      categoryId,
      sortOrder,
    }: {
      categoryId: string;
      sortOrder: number;
    }) => {
      const { error } = await supabase
        .from("treatment_categories")
        .update({ sort_order: sortOrder })
        .eq("id", categoryId);

      if (error) throw error;
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-categories", hotelId] });
    },
  });

  const addCategory = async (name: string) => {
    if (!hotelId) return;
    return addCategoryMutation.mutateAsync({ name, hotelId });
  };

  const renameCategory = async (
    categoryId: string,
    oldName: string,
    newName: string
  ) => {
    if (!hotelId) return;
    return renameCategoryMutation.mutateAsync({
      categoryId,
      oldName,
      newName,
      hotelId,
    });
  };

  const updateSortOrder = async (categoryId: string, sortOrder: number) => {
    return updateSortOrderMutation.mutateAsync({ categoryId, sortOrder });
  };

  const updateNameEn = async (categoryId: string, nameEn: string | null) => {
    return updateNameEnMutation.mutateAsync({ categoryId, nameEn });
  };

  const toggleAddon = async (categoryId: string, isAddon: boolean) => {
    return toggleAddonMutation.mutateAsync({ categoryId, isAddon });
  };

  const getTreatmentCountByCategory = async (categoryName: string) => {
    if (!hotelId) return 0;

    const { count, error } = await supabase
      .from("treatment_menus")
      .select("*", { count: "exact", head: true })
      .eq("category", categoryName)
      .eq("hotel_id", hotelId);

    if (error) return 0;
    return count || 0;
  };

  return {
    categories: categories || [],
    isLoading,
    refetch,
    addCategory,
    renameCategory,
    updateSortOrder,
    getTreatmentCountByCategory,
    updateNameEn,
    toggleAddon,
    isAdding: addCategoryMutation.isPending,
    isRenaming: renameCategoryMutation.isPending,
  };
}
