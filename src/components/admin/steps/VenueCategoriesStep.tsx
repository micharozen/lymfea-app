import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Tag, Pencil, Check, X } from "lucide-react";
import { useTreatmentCategories } from "@/hooks/useTreatmentCategories";
import { cn } from "@/lib/utils";

interface VenueCategoriesStepProps {
  hotelId: string | null;
}

export function VenueCategoriesStep({ hotelId }: VenueCategoriesStepProps) {
  const {
    categories,
    isLoading,
    addCategory,
    renameCategory,
    isAdding,
    isRenaming,
    getTreatmentCountByCategory,
  } = useTreatmentCategories(hotelId);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [treatmentCounts, setTreatmentCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchCounts = async () => {
      const counts: Record<string, number> = {};
      for (const cat of categories) {
        counts[cat.name] = await getTreatmentCountByCategory(cat.name);
      }
      setTreatmentCounts(counts);
    };

    if (categories.length > 0) {
      fetchCounts();
    }
  }, [categories]);

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    await addCategory(newCategoryName.trim());
    setNewCategoryName("");
  };

  const handleStartEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const handleSaveEdit = async (categoryId: string, oldName: string) => {
    if (!editingName.trim() || editingName === oldName) {
      handleCancelEdit();
      return;
    }
    await renameCategory(categoryId, oldName, editingName.trim());
    handleCancelEdit();
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    categoryId: string,
    oldName: string
  ) => {
    if (e.key === "Enter") {
      handleSaveEdit(categoryId, oldName);
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  if (!hotelId) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Veuillez d'abord enregistrer le lieu pour gérer les catégories.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-2 pb-2 border-b">
        <Tag className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">
          Catégories de soins
        </h3>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground">
        Gérez les catégories de traitements pour ce lieu. Les catégories
        permettent d'organiser vos soins dans le menu.
      </p>

      {/* Add new category */}
      <div className="space-y-2">
        <Label>Ajouter une catégorie</Label>
        <div className="flex gap-2">
          <Input
            placeholder="Nom de la catégorie"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddCategory();
              }
            }}
            disabled={isAdding}
          />
          <Button
            type="button"
            onClick={handleAddCategory}
            disabled={isAdding || !newCategoryName.trim()}
            className="shrink-0"
          >
            {isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Categories list */}
      <div className="space-y-2">
        <Label>Catégories existantes</Label>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border rounded-lg">
            Aucune catégorie. Ajoutez-en une ci-dessus.
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {categories.map((category) => {
              const isEditing = editingId === category.id;
              const treatmentCount = treatmentCounts[category.name] || 0;

              return (
                <div
                  key={category.id}
                  className={cn(
                    "flex items-center justify-between px-4 py-3 gap-3",
                    isEditing && "bg-muted/50"
                  )}
                >
                  {isEditing ? (
                    <div className="flex-1 flex items-center gap-2">
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) =>
                          handleKeyDown(e, category.id, category.name)
                        }
                        autoFocus
                        className="h-8"
                        disabled={isRenaming}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSaveEdit(category.id, category.name)}
                        disabled={isRenaming}
                        className="h-8 w-8 p-0"
                      >
                        {isRenaming ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4 text-green-600" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={handleCancelEdit}
                        disabled={isRenaming}
                        className="h-8 w-8 p-0"
                      >
                        <X className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{category.name}</span>
                        {treatmentCount > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({treatmentCount} soin{treatmentCount > 1 ? "s" : ""})
                          </span>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleStartEdit(category.id, category.name)}
                        className="h-8 w-8 p-0 shrink-0"
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Info note */}
      <p className="text-xs text-muted-foreground">
        Cliquez sur le crayon pour renommer une catégorie. Le renommage
        s'appliquera automatiquement à tous les soins associés.
      </p>
    </div>
  );
}
