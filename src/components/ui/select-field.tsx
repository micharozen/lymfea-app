import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export interface SelectFieldOption {
  value: string;
  label: string;
  /** Icône ou logo affiché avant le label (dans la liste et dans le déclencheur). */
  icon?: React.ReactNode;
  disabled?: boolean;
  /** Classes appliquées à l'option dans la liste — ex. griser un créneau indisponible. */
  className?: string;
}

export interface SelectFieldProps {
  options: SelectFieldOption[];
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  /** Barre de recherche, active par défaut. À couper pour les listes qu'on parcourt à l'œil (heures). */
  searchable?: boolean;
  disabled?: boolean;
  /** Classes du bouton déclencheur. */
  className?: string;
  /** Classes du panneau déroulant — par défaut il épouse la largeur du déclencheur. */
  contentClassName?: string;
  "aria-label"?: string;
}

/**
 * Sélecteur unique de l'application : Popover + Command, que la liste soit courte
 * (civilité) ou longue et cherchable (hôtels).
 *
 * Un seul composant plutôt que Radix Select ici et un combobox là, parce que les deux
 * ne surlignent pas l'option survolée de la même façon : Radix Select passe par un
 * focus() JS qui se fait voler dans une modale, alors que cmdk pose un data-selected
 * purement CSS. Résultat côté écran : la moitié des champs n'avaient aucun retour au survol.
 */
export function SelectField({
  options,
  value,
  onChange,
  placeholder = "Sélectionner...",
  searchPlaceholder = "Rechercher...",
  emptyMessage = "Aucun résultat.",
  searchable = true,
  disabled,
  className,
  contentClassName,
  "aria-label": ariaLabel,
}: SelectFieldProps) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((option) => option.value === value);

  // `modal` est indispensable : le panneau est portalisé hors d'une éventuelle modale
  // parente, dont le focus-trap rapatrierait sinon le focus à chaque frappe et rendrait
  // la barre de recherche inutilisable.
  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex items-center gap-2 truncate">
            {selected?.icon}
            <span className="truncate">{selected?.label ?? placeholder}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-[var(--radix-popover-trigger-width)] p-0 pointer-events-auto", contentClassName)}
        align="start"
      >
        <Command>
          {searchable && <CommandInput placeholder={searchPlaceholder} className="h-9 text-xs" />}
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  disabled={option.disabled}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn("gap-2 text-xs cursor-pointer", option.className)}
                >
                  <Check
                    className={cn("h-3.5 w-3.5 shrink-0", option.value === value ? "opacity-100" : "opacity-0")}
                  />
                  {option.icon}
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
