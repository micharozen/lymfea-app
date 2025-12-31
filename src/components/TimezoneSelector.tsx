import { useState, useMemo } from 'react';
import { Globe, RotateCcw, Check } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

  const groupedTimezones = useMemo(() => getGroupedTimezones(), []);

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

      <Select value={activeTimezone} onValueChange={setActiveTimezone}>
        <SelectTrigger className={cn(
          "w-auto min-w-[160px]",
          compact && "h-8 text-sm",
          isTemporaryTimezone && "border-amber-500/50 bg-amber-500/5"
        )}>
          <SelectValue>
            {compact ? currentLabel.split(',')[0] : currentLabel}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {Object.entries(groupedTimezones).map(([region, timezones]) => (
            timezones.length > 0 && (
              <SelectGroup key={region}>
                <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {region}
                </SelectLabel>
                {timezones.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    <div className="flex items-center justify-between w-full gap-4">
                      <span>{tz.label}</span>
                      <span className="text-xs text-muted-foreground">{tz.offset}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            )
          ))}
        </SelectContent>
      </Select>

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
}

/**
 * Timezone selector for forms (hotel edit, settings, etc.)
 */
export function TimezoneSelectField({ 
  value, 
  onChange, 
  label = "Fuseau horaire",
  className 
}: TimezoneSelectFieldProps) {
  const groupedTimezones = useMemo(() => getGroupedTimezones(), []);

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label className="text-sm font-medium">{label}</label>
      )}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="Sélectionner un fuseau horaire" />
          </div>
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {Object.entries(groupedTimezones).map(([region, timezones]) => (
            timezones.length > 0 && (
              <SelectGroup key={region}>
                <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {region}
                </SelectLabel>
                {timezones.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    <div className="flex items-center justify-between w-full gap-4">
                      <span>{tz.label}</span>
                      <span className="text-xs text-muted-foreground">{tz.offset}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            )
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
