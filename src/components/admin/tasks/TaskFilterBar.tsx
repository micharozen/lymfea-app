import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ListFilter, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SelectField, type SelectFieldOption } from "@/components/ui/select-field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface TaskFilterDef {
  key: string;
  /** Libellé du filtre, affiché dans le menu d'ajout et devant la valeur. */
  label: string;
  options: SelectFieldOption[];
}

interface Props {
  filters: TaskFilterDef[];
  /** Valeur courante de chaque filtre ; "all" signifie « pas de filtre ». */
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  /** Clés affichées, même à "all" — l'utilisateur vient de les ajouter. */
  visibleKeys: string[];
  onVisibleKeysChange: (keys: string[]) => void;
}

/**
 * Barre de filtres à la demande.
 *
 * Six sélecteurs alignés en permanence noyaient la page sous des contrôles
 * presque toujours à « tous ». Ici, seuls les filtres réellement utilisés sont
 * affichés : « Filtrer » propose ceux qui restent, et chaque filtre actif se
 * retire d'une croix. Un filtre dont la valeur n'est pas "all" reste visible
 * même s'il n'a pas été ajouté à la main (cas d'un lien entrant pré-filtré).
 */
export function TaskFilterBar({
  filters,
  values,
  onChange,
  visibleKeys,
  onVisibleKeysChange,
}: Props) {
  const { t } = useTranslation("admin");

  const shown = useMemo(
    () => filters.filter((f) => visibleKeys.includes(f.key) || (values[f.key] ?? "all") !== "all"),
    [filters, visibleKeys, values],
  );
  const available = useMemo(
    () => filters.filter((f) => !shown.some((s) => s.key === f.key)),
    [filters, shown],
  );

  const remove = (key: string) => {
    onChange(key, "all");
    onVisibleKeysChange(visibleKeys.filter((k) => k !== key));
  };

  return (
    <>
      {shown.map((filter) => (
        <div
          key={filter.key}
          className="border-border bg-card flex items-center gap-1 rounded-md border pl-2"
        >
          <span className="text-muted-foreground shrink-0 text-xs">{filter.label}</span>
          <SelectField
            options={filter.options}
            value={values[filter.key] ?? "all"}
            onChange={(value) => onChange(filter.key, value)}
            aria-label={filter.label}
            className="h-8 w-[170px] border-0 bg-transparent shadow-none"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground h-8 w-7 shrink-0"
            onClick={() => remove(filter.key)}
            aria-label={t("tasks.removeFilter", { filter: filter.label })}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      {available.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-9 border-dashed">
              <ListFilter className="mr-2 h-4 w-4" />
              {t("tasks.addFilter")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {available.map((filter) => (
              <DropdownMenuItem
                key={filter.key}
                onSelect={() => onVisibleKeysChange([...visibleKeys, filter.key])}
              >
                {filter.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}
