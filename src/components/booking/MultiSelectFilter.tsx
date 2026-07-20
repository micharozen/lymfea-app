import { useState, type ReactNode } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Rendered before the label (colour swatch, status icon…). */
  adornment?: ReactNode;
  /** Extra classes on the option row, e.g. the pastel status backgrounds. */
  className?: string;
}

interface MultiSelectFilterProps {
  /** Selected values. Empty means "no restriction" — the filter is inactive. */
  value: string[];
  onChange: (value: string[]) => void;
  options: MultiSelectOption[];
  /** Label shown when nothing is selected, e.g. "Tous les lieux". */
  allLabel: string;
  /** Placeholder of the search box. Omit to hide the search box. */
  searchPlaceholder?: string;
  emptyLabel?: string;
  triggerClassName?: string;
}

/**
 * Multi-select filter built on Popover + Command, matching the venue/therapist
 * comboboxes already used in the bookings toolbar.
 *
 * An empty selection means "everything": it keeps the filter inactive by
 * default and lets callers test `value.length === 0` rather than a sentinel.
 */
export function MultiSelectFilter({
  value,
  onChange,
  options,
  allLabel,
  searchPlaceholder,
  emptyLabel = "Aucun résultat.",
  triggerClassName,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);

  const toggle = (optionValue: string) => {
    onChange(
      value.includes(optionValue)
        ? value.filter((v) => v !== optionValue)
        : [...value, optionValue]
    );
  };

  const selectedOptions = options.filter((o) => value.includes(o.value));
  const label =
    selectedOptions.length === 0
      ? allLabel
      : selectedOptions.length === 1
        ? selectedOptions[0].label
        : `${selectedOptions.length} sélectionnés`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-8 px-2 text-xs font-normal justify-between w-[160px]",
            triggerClassName
          )}
        >
          <div className="flex items-center gap-1.5 truncate">
            {selectedOptions.length === 1 && selectedOptions[0].adornment}
            <span className="truncate">{label}</span>
          </div>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <Command>
          {searchPlaceholder && (
            <CommandInput placeholder={searchPlaceholder} className="h-8 text-xs" />
          )}
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={allLabel}
                onSelect={() => onChange([])}
                className="text-xs"
              >
                <Check
                  className={cn(
                    "mr-2 h-3.5 w-3.5",
                    value.length === 0 ? "opacity-100" : "opacity-0"
                  )}
                />
                {allLabel}
              </CommandItem>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => toggle(option.value)}
                  className={cn("text-xs my-0.5 rounded-sm", option.className)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5",
                      value.includes(option.value) ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.adornment}
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
