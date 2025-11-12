import { useState } from "react";
import { CalendarIcon, ChevronDown, Check, ArrowLeft } from "lucide-react";
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

type PeriodType = "today" | "last-week" | "last-30-days" | "next-week" | "custom";

interface PeriodSelectorProps {
  onPeriodChange?: (startDate: Date, endDate: Date) => void;
}

export function PeriodSelector({ onPeriodChange }: PeriodSelectorProps) {
  const [periodType, setPeriodType] = useState<PeriodType>("last-30-days");
  const [customStartDate, setCustomStartDate] = useState<Date>();
  const [customEndDate, setCustomEndDate] = useState<Date>();
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomCalendar, setShowCustomCalendar] = useState(false);

  const getPeriodLabel = () => {
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
        return "30 derniers jours";
    }
  };

  const handlePeriodTypeChange = (value: PeriodType) => {
    if (value === "custom") {
      setShowCustomCalendar(true);
      setPeriodType(value);
      return;
    }
    
    setPeriodType(value);
    setShowCustomCalendar(false);
    
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
      setShowCustomCalendar(false);
    }
  };

  const handleBack = () => {
    setShowCustomCalendar(false);
    if (periodType === "custom" && !customStartDate && !customEndDate) {
      setPeriodType("last-30-days");
    }
  };

  const periods = [
    { value: "today" as PeriodType, label: "Aujourd'hui" },
    { value: "last-week" as PeriodType, label: "Semaine dernière" },
    { value: "last-30-days" as PeriodType, label: "30 derniers jours" },
    { value: "next-week" as PeriodType, label: "Semaine prochaine" },
    { value: "custom" as PeriodType, label: "Date personnalisée" },
  ];

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="min-w-[200px] justify-between text-sm font-normal bg-card border-border hover:bg-card hover:border-foreground/20 transition-colors"
        >
          <span className="text-muted-foreground">{getPeriodLabel()}</span>
          <ChevronDown className="ml-2 h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0 bg-card border border-border" align="end">
        {!showCustomCalendar ? (
          <div className="p-2">
            {periods.map((period) => (
              <button
                key={period.value}
                onClick={() => handlePeriodTypeChange(period.value)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md hover:bg-secondary/50 transition-colors flex items-center justify-between text-sm",
                  periodType === period.value && "bg-secondary font-medium"
                )}
              >
                <span>{period.label}</span>
                {periodType === period.value && (
                  <Check className="h-4 w-4" />
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour
            </button>

            <div>
              <label className="text-xs font-medium mb-2 block text-muted-foreground">Date de début</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !customStartDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    <span className="text-xs">
                      {customStartDate ? format(customStartDate, "dd MMM yyyy", { locale: fr }) : "Sélectionner"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-card border border-border" align="start">
                  <Calendar
                    mode="single"
                    selected={customStartDate}
                    onSelect={setCustomStartDate}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <label className="text-xs font-medium mb-2 block text-muted-foreground">Date de fin</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !customEndDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    <span className="text-xs">
                      {customEndDate ? format(customEndDate, "dd MMM yyyy", { locale: fr }) : "Sélectionner"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-card border border-border" align="start">
                  <Calendar
                    mode="single"
                    selected={customEndDate}
                    onSelect={setCustomEndDate}
                    disabled={(date) => customStartDate ? date < customStartDate : false}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <Button
              size="sm"
              onClick={handleCustomDateConfirm}
              disabled={!customStartDate || !customEndDate}
              className="w-full text-xs"
            >
              Confirmer
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
