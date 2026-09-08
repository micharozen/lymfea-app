import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import type { TaskChecklistItem } from "@shared/db";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

interface TaskChecklistProps {
  value: TaskChecklistItem[];
  onChange: (next: TaskChecklistItem[]) => void;
}

/**
 * Les « actions à réaliser » d'une tâche. La liste est portée par le formulaire
 * et enregistrée en bloc dans la colonne jsonb `tasks.checklist` — pas d'écriture
 * séparée, y compris quand la tâche n'existe pas encore.
 */
export function TaskChecklist({ value, onChange }: TaskChecklistProps) {
  const { t } = useTranslation("admin");

  const addItem = () => {
    onChange([...value, { id: crypto.randomUUID(), label: "", done: false }]);
  };

  const updateItem = (id: string, patch: Partial<TaskChecklistItem>) => {
    onChange(value.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeItem = (id: string) => {
    onChange(value.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-2">
      {value.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <Checkbox
            checked={item.done}
            onCheckedChange={(checked) => updateItem(item.id, { done: checked === true })}
            aria-label={item.label || t("tasks.fields.checklist")}
          />
          <Input
            value={item.label}
            onChange={(e) => updateItem(item.id, { label: e.target.value })}
            onKeyDown={(e) => {
              // Entrée enchaîne sur un nouvel élément au lieu de soumettre le formulaire.
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
            }}
            placeholder={t("tasks.fields.checklistItemPlaceholder")}
            className={item.done ? "text-muted-foreground line-through" : undefined}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => removeItem(item.id)}
            aria-label={t("common.delete")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="h-8" onClick={addItem}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        {t("tasks.fields.addChecklistItem")}
      </Button>
    </div>
  );
}
