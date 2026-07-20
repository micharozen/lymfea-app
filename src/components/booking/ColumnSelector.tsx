import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, Columns3, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ColumnLike, ColumnPreferences } from "@/hooks/useColumnPreferences";

interface ColumnSelectorProps<T extends ColumnLike & { label: string }> {
  preferences: ColumnPreferences<T>;
  /** Colonnes retirées en amont (ex. "Lieu" pour un concierge) : à ne pas lister. */
  hiddenKeys?: string[];
}

export function ColumnSelector<T extends ColumnLike & { label: string }>({
  preferences,
  hiddenKeys = [],
}: ColumnSelectorProps<T>) {
  const [open, setOpen] = useState(false);
  const { orderedColumns, visibleKeys, toggle, reorder, reset, isDefault } = preferences;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const listed = orderedColumns.filter((column) => !hiddenKeys.includes(column.key));
  const visibleCount = listed.filter((column) => visibleKeys.includes(column.key)).length;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorder(String(active.id), String(over.id));
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-normal">
          <Columns3 className="h-3.5 w-3.5" />
          Colonnes
          <span className="ml-0.5 rounded-full bg-secondary px-1.5 text-[10px] leading-4 text-secondary-foreground">
            {visibleCount}/{listed.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-1" align="start">
        <div className="max-h-[320px] overflow-y-auto">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={listed.map((column) => column.key)}
              strategy={verticalListSortingStrategy}
            >
              {listed.map((column) => {
                const isVisible = visibleKeys.includes(column.key);
                return (
                  <SortableColumnRow
                    key={column.key}
                    id={column.key}
                    label={column.label}
                    isVisible={isVisible}
                    // On refuse de masquer la dernière colonne : un tableau sans
                    // colonne n'a pas d'état de sortie utilisable.
                    canToggle={!isVisible || visibleCount > 1}
                    onToggle={() => toggle(column.key)}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        </div>
        {!isDefault && (
          <button
            type="button"
            onClick={reset}
            className="mt-1 w-full rounded-sm border-t border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
          >
            Réinitialiser
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface SortableColumnRowProps {
  id: string;
  label: string;
  isVisible: boolean;
  canToggle: boolean;
  onToggle: () => void;
}

function SortableColumnRow({ id, label, isVisible, canToggle, onToggle }: SortableColumnRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-1 rounded-sm bg-popover",
        isDragging && "relative z-10 shadow-sm"
      )}
    >
      <button
        type="button"
        className="cursor-grab px-1 py-1.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={`Déplacer ${label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onToggle}
        disabled={!canToggle}
        className="flex flex-1 items-center justify-between rounded-sm px-1 py-1.5 text-xs hover:bg-secondary/50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="truncate">{label}</span>
        <Check className={cn("h-3.5 w-3.5 shrink-0", isVisible ? "opacity-100" : "opacity-0")} />
      </button>
    </div>
  );
}
