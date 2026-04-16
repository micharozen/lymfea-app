import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useTreatmentCategories,
  type TreatmentCategory,
} from "@/hooks/useTreatmentCategories";
import { CategoryQuickCreateDialog } from "./CategoryQuickCreateDialog";

interface CategorySelectFieldProps {
  hotelId: string | null | undefined;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  emptyHint?: string;
  noHotelHint?: string;
  filter?: "all" | "addonOnly" | "excludeAddon";
  defaultIsAddon?: boolean;
  hideIsAddonInDialog?: boolean;
}

export function CategorySelectField({
  hotelId,
  value,
  onChange,
  disabled = false,
  placeholder = "Sélectionner une catégorie",
  emptyHint = "Aucune catégorie. Créez-en une ci-dessous.",
  noHotelHint = "Sélectionnez d'abord un lieu",
  filter = "all",
  defaultIsAddon = false,
  hideIsAddonInDialog = false,
}: CategorySelectFieldProps) {
  const { categories, isLoading } = useTreatmentCategories(hotelId);
  const [selectOpen, setSelectOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const visibleCategories = categories.filter((cat) => {
    if (filter === "addonOnly") return cat.is_addon;
    if (filter === "excludeAddon") return !cat.is_addon;
    return true;
  });

  const handleCreateClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectOpen(false);
    setDialogOpen(true);
  };

  const handleCreated = (category: TreatmentCategory) => {
    onChange(category.name);
  };

  return (
    <>
      <Select
        open={selectOpen}
        onOpenChange={setSelectOpen}
        onValueChange={onChange}
        value={value}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : visibleCategories.length === 0 ? (
            <div className="px-2 py-2 text-sm text-muted-foreground">
              {hotelId ? emptyHint : noHotelHint}
            </div>
          ) : (
            visibleCategories.map((category) => (
              <SelectItem key={category.id} value={category.name}>
                {category.name}
              </SelectItem>
            ))
          )}

          {hotelId && (
            <>
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                onClick={handleCreateClick}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-primary hover:bg-accent focus:bg-accent focus:outline-none"
              >
                <Plus className="h-4 w-4" />
                Créer une catégorie
              </button>
            </>
          )}
        </SelectContent>
      </Select>

      <CategoryQuickCreateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        hotelId={hotelId}
        defaultIsAddon={defaultIsAddon}
        hideIsAddon={hideIsAddonInDialog}
        onCreated={handleCreated}
      />
    </>
  );
}
