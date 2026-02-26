import { useState, useMemo } from 'react';
import { Globe, RotateCcw, Search } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTimezone } from '@/contexts/TimezoneContext';
import { TIMEZONE_OPTIONS, getGroupedTimezones, getTimezoneLabel } from '@/lib/timezones';
import { cn } from '@/lib/utils';

interface TimezoneSelectorProps {
  /** Compact mode for toolbar */
  compact?: boolean;
  /** Show reset button when temporary timezone is active */
  showReset?: boolean;
  /** Additional class names */
  className?: string;
}

export function TimezoneSelector({ 
  compact = false, 
  showReset = true,
  className 
}: TimezoneSelectorProps) {
  const { 
    activeTimezone, 
    setActiveTimezone, 
    resetToUserTimezone, 
    isTemporaryTimezone,
    userTimezone 
  } = useTimezone();

  const [open, setOpen] = useState(false);

  const currentLabel = getTimezoneLabel(activeTimezone);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1">
              <Globe className="h-4 w-4 text-muted-foreground" />
              {isTemporaryTimezone && (
                <span className="h-2 w-2 rounded-full bg-amber-500" />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {isTemporaryTimezone 
              ? `Vue temporaire (votre fuseau: ${getTimezoneLabel(userTimezone)})`
              : 'Fuseau horaire'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-auto min-w-[160px] justify-between font-normal",
              compact && "h-8 text-sm",
              isTemporaryTimezone && "border-amber-500/50 bg-amber-500/5"
            )}
          >
            {compact ? currentLabel.split(',')[0] : currentLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Rechercher un fuseau horaire..." />
            <CommandList className="max-h-[300px]">
              <CommandEmpty>Aucun fuseau horaire trouvé.</CommandEmpty>
              {Object.entries(getGroupedTimezones()).map(([region, timezones]) => (
                timezones.length > 0 && (
                  <CommandGroup key={region} heading={region}>
                    {timezones.map((tz) => (
                      <CommandItem
                        key={tz.value}
                        value={`${tz.label} ${tz.value}`}
                        onSelect={() => {
                          setActiveTimezone(tz.value);
                          setOpen(false);
                        }}
                        className="flex items-center justify-between"
                      >
                        <span>{tz.label}</span>
                        <span className="text-xs text-muted-foreground">{tz.offset}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {showReset && isTemporaryTimezone && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={resetToUserTimezone}
                className="h-8 w-8"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Revenir à votre fuseau ({getTimezoneLabel(userTimezone)})
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

interface TimezoneSelectFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Timezone selector for forms (hotel edit, settings, etc.) with search
 */
export function TimezoneSelectField({
  value,
  onChange,
  label = "Fuseau horaire",
  className,
  disabled
}: TimezoneSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const currentLabel = getTimezoneLabel(value);

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label className="text-sm font-medium">{label}</label>
      )}
      <Popover open={disabled ? false : open} onOpenChange={disabled ? undefined : setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal hover:bg-background hover:text-foreground"
          >
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span>{currentLabel || "Sélectionner un fuseau horaire"}</span>
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Rechercher un fuseau horaire..." />
            <CommandList className="max-h-[300px]">
              <CommandEmpty>Aucun fuseau horaire trouvé.</CommandEmpty>
              {Object.entries(getGroupedTimezones()).map(([region, timezones]) => (
                timezones.length > 0 && (
                  <CommandGroup key={region} heading={region}>
                    {timezones.map((tz) => (
                      <CommandItem
                        key={tz.value}
                        value={`${tz.label} ${tz.value}`}
                        onSelect={() => {
                          onChange(tz.value);
                          setOpen(false);
                        }}
                        className="flex items-center justify-between"
                      >
                        <span>{tz.label}</span>
                        <span className="text-xs text-muted-foreground">{tz.offset}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
