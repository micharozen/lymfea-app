import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
import type { SelectFieldOption } from "@/components/ui/select-field";

export interface MultiSelectFieldProps {
  options: SelectFieldOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  "aria-label"?: string;
}

/**
 * Pendant multi-valeurs de {@link SelectField} : mêmes Popover + Command, mêmes
 * raisons (cf. le commentaire de select-field.tsx sur Radix Select en modale).
 * La seule différence de comportement est que le panneau reste ouvert d'une
 * sélection à l'autre, pour cocher plusieurs entrées d'affilée.
 */
export function MultiSelectField({
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
}: MultiSelectFieldProps) {
  const [open, setOpen] = React.useState(false);

  // Un id resté dans la valeur alors que son option a disparu (soin supprimé)
  // est simplement ignoré à l'affichage.
  const selected = options.filter((option) => value.includes(option.value));

  const toggle = (optionValue: string) => {
    onChange(
      value.includes(optionValue)
        ? value.filter((v) => v !== optionValue)
        : [...value, optionValue],
    );
  };

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
            "h-auto min-h-9 w-full justify-between py-1.5 font-normal",
            selected.length === 0 && "text-muted-foreground",
            className,
          )}
        >
          {selected.length === 0 ? (
            <span className="truncate">{placeholder}</span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {selected.map((option) => (
                <Badge key={option.value} variant="secondary" className="gap-1 font-normal">
                  <span className="truncate">{option.label}</span>
                  <X
                    className="h-3 w-3 shrink-0 opacity-60 hover:opacity-100"
                    role="button"
                    aria-label={option.label}
                    onClick={(e) => {
                      // Retirer une entrée sans ouvrir le panneau.
                      e.stopPropagation();
                      toggle(option.value);
                    }}
                  />
                </Badge>
              ))}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "w-[var(--radix-popover-trigger-width)] p-0 pointer-events-auto",
          contentClassName,
        )}
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
                  onSelect={() => toggle(option.value)}
                  className={cn("gap-2 text-xs cursor-pointer", option.className)}
                >
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      value.includes(option.value) ? "opacity-100" : "opacity-0",
                    )}
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
