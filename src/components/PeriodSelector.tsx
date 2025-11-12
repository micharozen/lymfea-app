import { useState } from "react";
import { CalendarIcon, ChevronDown } from "lucide-react";
import { format, subDays, startOfWeek, endOfWeek, addWeeks, startOfDay, endOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PeriodType = "today" | "last-week" | "last-30-days" | "next-week" | "custom";

interface PeriodSelectorProps {
  onPeriodChange?: (startDate: Date, endDate: Date) => void;
}

export function PeriodSelector({ onPeriodChange }: PeriodSelectorProps) {
  const [periodType, setPeriodType] = useState<PeriodType>("last-30-days");
  const [customStartDate, setCustomStartDate] = useState<Date>();
  const [customEndDate, setCustomEndDate] = useState<Date>();
  const [isOpen, setIsOpen] = useState(false);

  const getPeriodLabel = () => {
    const today = new Date();
    
    switch (periodType) {
      case "today":
        return "Aujourd'hui";
      case "last-week":
        return "Semaine dernière";
      case "last-30-days":
        return "30 derniers jours";
      case "next-week":
        return "Semaine prochaine";
      case "custom":
        if (customStartDate && customEndDate) {
          return `${format(customStartDate, "dd MMM", { locale: fr })} - ${format(customEndDate, "dd MMM", { locale: fr })}`;
        }
        return "Date personnalisée";
      default:
        return "Sélectionner période";
    }
  };

  const handlePeriodTypeChange = (value: PeriodType) => {
    setPeriodType(value);
    
    if (value === "custom") {
      return; // L'utilisateur doit sélectionner les dates
    }
    
    const today = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (value) {
      case "today":
        startDate = startOfDay(today);
        endDate = endOfDay(today);
        break;
      case "last-week":
        const lastWeekStart = startOfWeek(subDays(today, 7), { weekStartsOn: 1 });
        const lastWeekEnd = endOfWeek(subDays(today, 7), { weekStartsOn: 1 });
        startDate = lastWeekStart;
        endDate = lastWeekEnd;
        break;
      case "last-30-days":
        startDate = subDays(today, 30);
        endDate = today;
        break;
      case "next-week":
        const nextWeekStart = startOfWeek(addWeeks(today, 1), { weekStartsOn: 1 });
        const nextWeekEnd = endOfWeek(addWeeks(today, 1), { weekStartsOn: 1 });
        startDate = nextWeekStart;
        endDate = nextWeekEnd;
        break;
      default:
        startDate = subDays(today, 30);
        endDate = today;
    }

    if (onPeriodChange) {
      onPeriodChange(startDate, endDate);
    }
    
    setIsOpen(false);
  };

  const handleCustomDateConfirm = () => {
    if (customStartDate && customEndDate && onPeriodChange) {
      onPeriodChange(customStartDate, customEndDate);
      setIsOpen(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {getPeriodLabel()}
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="end">
        <div className="space-y-4">
          <Select value={periodType} onValueChange={(value) => handlePeriodTypeChange(value as PeriodType)}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner période" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Aujourd'hui</SelectItem>
              <SelectItem value="last-week">Semaine dernière</SelectItem>
              <SelectItem value="last-30-days">30 derniers jours</SelectItem>
              <SelectItem value="next-week">Semaine prochaine</SelectItem>
              <SelectItem value="custom">Date personnalisée</SelectItem>
            </SelectContent>
          </Select>

          {periodType === "custom" && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-2 block">Date de début</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !customStartDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customStartDate ? format(customStartDate, "PPP", { locale: fr }) : "Sélectionner"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customStartDate}
                      onSelect={setCustomStartDate}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Date de fin</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !customEndDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customEndDate ? format(customEndDate, "PPP", { locale: fr }) : "Sélectionner"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customEndDate}
                      onSelect={setCustomEndDate}
                      disabled={(date) => customStartDate ? date < customStartDate : false}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <Button
                onClick={handleCustomDateConfirm}
                disabled={!customStartDate || !customEndDate}
                className="w-full"
              >
                Confirmer
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
