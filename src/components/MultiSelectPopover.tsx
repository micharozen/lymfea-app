import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

export type MultiSelectOption = {
  value: string;
  label: string;
};

type Props = {
  placeholder?: string;
  selected: string[];
  onChange: (next: string[]) => void;
  options: MultiSelectOption[];
  popoverWidthClassName?: string;
  popoverMaxHeightClassName?: string;
  triggerClassName?: string;
};

export function MultiSelectPopover({
  placeholder = "Sélectionner",
  selected,
  onChange,
  options,
  popoverWidthClassName = "w-48",
  popoverMaxHeightClassName = "h-40",
  triggerClassName,
}: Props) {
  const selectedLabel = React.useMemo(() => {
    if (!selected.length) return placeholder;
    const map = new Map(options.map((o) => [o.value, o.label] as const));
    return selected.map((v) => map.get(v)).filter(Boolean).join(", ");
  }, [options, placeholder, selected]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-between font-normal h-9 text-xs hover:bg-background hover:text-foreground",
            triggerClassName,
          )}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className={cn(popoverWidthClassName, "p-0")}
        align="start"
        onWheelCapture={(e) => e.stopPropagation()}
        onTouchMoveCapture={(e) => e.stopPropagation()}
      >
        <ScrollArea className={cn(popoverMaxHeightClassName, "touch-pan-y")}
        >
          <div className="p-1">
            {options.map((opt) => {
              const isSelected = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(
                      isSelected
                        ? selected.filter((v) => v !== opt.value)
                        : [...selected, opt.value],
                    );
                  }}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 rounded-sm",
                    "px-3 py-1.5 text-sm text-popover-foreground transition-colors",
                    "hover:bg-foreground/5",
                    isSelected && "font-medium",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-left">{opt.label}</span>
                  {isSelected ? (
                    <span
                      aria-hidden
                      className="h-4 w-4 shrink-0 grid place-items-center text-popover-foreground font-semibold"
                    >
                      ✓
                    </span>
                  ) : (
                    <span className="h-4 w-4 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
