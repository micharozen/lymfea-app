import { useState, useEffect } from "react";
import { CalendarIcon, ChevronDown, Check, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { format, subDays, startOfWeek, endOfWeek, addWeeks, startOfDay, endOfDay } from "date-fns";
import { useDateLocale } from "@/lib/dateLocale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
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
  const { t } = useTranslation("common");
  const dateLocale = useDateLocale();
  const [periodType, setPeriodType] = useState<PeriodType>("last-30-days");
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomCalendar, setShowCustomCalendar] = useState(false);

  // Gérer la sélection de dates pour permettre de cliquer deux fois sur le même jour
  const handleDateSelect = (range: DateRange | undefined) => {
    if (!range) {
      setCustomDateRange(undefined);
      return;
    }

    // Si on a déjà une date de début mais pas de fin, et qu'on clique sur la même date
    if (range.from && !range.to && customDateRange?.from && 
        format(range.from, 'yyyy-MM-dd') === format(customDateRange.from, 'yyyy-MM-dd')) {
      // Définir la même date comme début et fin
      setCustomDateRange({ from: range.from, to: range.from });
    } else {
      setCustomDateRange(range);
    }
  };

  // Initialiser avec la période par défaut au montage
  useEffect(() => {
    const today = new Date();
    if (onPeriodChange) {
      onPeriodChange(startOfDay(subDays(today, 30)), endOfDay(today));
    }
  }, []);

  const getPeriodLabel = () => {
    switch (periodType) {
      case "today":
        return t("dates.today");
      case "last-week":
        return t("periodSelector.lastWeek");
      case "last-30-days":
        return t("periodSelector.last30Days");
      case "next-week":
        return t("periodSelector.nextWeek");
      case "custom":
        if (customDateRange?.from && customDateRange?.to) {
          return `${format(customDateRange.from, "dd MMM", { locale: dateLocale })} - ${format(customDateRange.to, "dd MMM", { locale: dateLocale })}`;
        }
        return t("periodSelector.custom");
      default:
        return t("periodSelector.last30Days");
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
        startDate = today;
        endDate = today;
        break;
      case "last-week":
        startDate = startOfWeek(subDays(today, 7), { weekStartsOn: 1 });
        endDate = endOfWeek(subDays(today, 7), { weekStartsOn: 1 });
        break;
      case "last-30-days":
        startDate = subDays(today, 30);
        endDate = today;
        break;
      case "next-week":
        startDate = startOfWeek(addWeeks(today, 1), { weekStartsOn: 1 });
        endDate = endOfWeek(addWeeks(today, 1), { weekStartsOn: 1 });
        break;
      default:
        startDate = subDays(today, 30);
        endDate = today;
    }

    if (onPeriodChange) {
      // Bornes normalisées sur la journée entière : une date horodatée exclurait
      // les réservations du premier jour (comparaison à minuit côté filtre) et
      // ferait changer les clés de cache à chaque montage.
      onPeriodChange(startOfDay(startDate), endOfDay(endDate));
    }
    
    setIsOpen(false);
  };

  const handleCustomDateConfirm = () => {
    if (customDateRange?.from && customDateRange?.to && onPeriodChange) {
      onPeriodChange(startOfDay(customDateRange.from), endOfDay(customDateRange.to));
      setIsOpen(false);
      setShowCustomCalendar(false);
    }
  };

  const handleBack = () => {
    setShowCustomCalendar(false);
    if (periodType === "custom" && !customDateRange?.from && !customDateRange?.to) {
      setPeriodType("last-30-days");
    }
  };

  const periods = [
    { value: "today" as PeriodType, label: t("dates.today") },
    { value: "last-week" as PeriodType, label: t("periodSelector.lastWeek") },
    { value: "last-30-days" as PeriodType, label: t("periodSelector.last30Days") },
    { value: "next-week" as PeriodType, label: t("periodSelector.nextWeek") },
    { value: "custom" as PeriodType, label: t("periodSelector.custom") },
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
      <PopoverContent className="w-auto p-0 bg-card border border-border shadow-lg z-50" align="end">
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
              {t("buttons.back")}
            </button>

            <div>
              <label className="text-xs font-medium mb-2 block text-muted-foreground">{t("periodSelector.selectRange")}</label>
              <Calendar
                mode="range"
                selected={customDateRange}
                onSelect={handleDateSelect}
                numberOfMonths={1}
                initialFocus
                className="p-3 pointer-events-auto"
                locale={dateLocale}
              />
            </div>

            <Button
              size="sm"
              onClick={handleCustomDateConfirm}
              disabled={!customDateRange?.from || !customDateRange?.to}
              className="w-full text-xs"
            >
              {t("buttons.confirm")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
