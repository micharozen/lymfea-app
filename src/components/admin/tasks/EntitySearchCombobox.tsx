import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface EntitySearchComboboxProps<T> {
  value: T | null;
  onChange: (item: T | null) => void;
  search: (query: string) => Promise<T[]>;
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
}

// Generic server-backed combobox: `search` runs on the entered query (server
// filtering, so cmdk's client filter is disabled). Selecting an item calls
// onChange; the clear button resets to null.
//
// The search field renders INLINE (not in a Popover). This combobox lives
// inside modal Dialogs (QuickActionsDialog, TaskDialog); a Popover/popper
// nested in a Radix Dialog fights the Dialog's focus trap ("Blocked
// aria-hidden … descendant retained focus"), leaving the search input
// unusable. Rendering the Command in normal flow avoids the conflict entirely.
export function EntitySearchCombobox<T>({
  value,
  onChange,
  search,
  getKey,
  getLabel,
  placeholder,
  searchPlaceholder,
  emptyText,
}: EntitySearchComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const handle = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const items = await search(query);
        if (active) setResults(items);
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query, open, search]);

  const handleSelect = (item: T) => {
    onChange(item);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="flex-1 justify-between font-normal"
          onClick={() => setOpen((prev) => !prev)}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value ? getLabel(value) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => onChange(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {open && (
        <Command shouldFilter={false} className="rounded-md border">
          <CommandInput
            autoFocus
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {loading ? "…" : query.trim().length < 2 ? searchPlaceholder : emptyText}
            </CommandEmpty>
            {results.map((item) => {
              const key = getKey(item);
              const selected = value ? getKey(value) === key : false;
              return (
                <CommandItem
                  key={key}
                  value={key}
                  onSelect={() => handleSelect(item)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selected ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {getLabel(item)}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      )}
    </div>
  );
}
