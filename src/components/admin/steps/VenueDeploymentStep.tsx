import { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import {
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  CalendarIcon,
  X,
  Clock,
  CalendarDays,
  ToggleLeft,
  Repeat,
  CalendarCheck,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { VenueWizardFormValues } from "../VenueWizardDialog";

const DAYS_OF_WEEK = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
  { value: 0, label: "Dim" },
];

// Generate time options from 00:00 to 23:30 in 30-minute increments
const generateTimeOptions = () => {
  const options = [];
  for (let hour = 0; hour < 24; hour++) {
    for (const minute of [0, 30]) {
      const value = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      options.push({ value, label: value });
    }
  }
  return options;
};

const TIME_OPTIONS = generateTimeOptions();

// Section header component
function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b mb-4">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
  );
}

export interface DeploymentScheduleState {
  isAlwaysOpen: boolean;
  scheduleType: "specific_days" | "one_time";
  selectedDays: number[];
  recurringStartDate: Date | undefined;
  recurringEndDate: Date | undefined;
  specificDates: Date[];
}

interface VenueDeploymentStepProps {
  form: UseFormReturn<VenueWizardFormValues>;
  state: DeploymentScheduleState;
  onChange: (state: DeploymentScheduleState) => void;
}

export function VenueDeploymentStep({ form, state, onChange }: VenueDeploymentStepProps) {
  const {
    isAlwaysOpen,
    scheduleType,
    selectedDays,
    recurringStartDate,
    recurringEndDate,
    specificDates,
  } = state;

  const updateState = (updates: Partial<DeploymentScheduleState>) => {
    onChange({ ...state, ...updates });
  };

  const handleDayToggle = (day: number) => {
    const newDays = selectedDays.includes(day)
      ? selectedDays.filter(d => d !== day)
      : [...selectedDays, day];
    updateState({ selectedDays: newDays });
  };

  const handleSpecificDateSelect = (date: Date | undefined) => {
    if (!date) return;

    const dateStr = format(date, "yyyy-MM-dd");
    const existingIndex = specificDates.findIndex(
      d => format(d, "yyyy-MM-dd") === dateStr
    );

    if (existingIndex >= 0) {
      updateState({
        specificDates: specificDates.filter((_, i) => i !== existingIndex)
      });
    } else {
      updateState({
        specificDates: [...specificDates, date].sort((a, b) => a.getTime() - b.getTime())
      });
    }
  };

  const removeSpecificDate = (index: number) => {
    updateState({
      specificDates: specificDates.filter((_, i) => i !== index)
    });
  };

  return (
    <div className="space-y-6">
      {/* Opening hours section */}
      <div>
        <SectionHeader icon={Clock} title="Horaires" />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="opening_time"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  Heure d'ouverture
                </FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map(time => (
                      <SelectItem key={time.value} value={time.value}>
                        {time.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="closing_time"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  Heure de fermeture
                </FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map(time => (
                      <SelectItem key={time.value} value={time.value}>
                        {time.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Deployment schedule section */}
      <div>
        <SectionHeader icon={CalendarDays} title="Planning de déploiement" />

        {/* Always open switch */}
        <div className="flex items-center justify-between py-3 px-4 border rounded-lg bg-muted/20 mb-4">
          <Label htmlFor="always-open" className="cursor-pointer flex items-center gap-2">
            <ToggleLeft className="h-4 w-4 text-muted-foreground" />
            Toujours disponible
          </Label>
          <Switch
            id="always-open"
            checked={isAlwaysOpen}
            onCheckedChange={(checked) => updateState({ isAlwaysOpen: checked })}
          />
        </div>

        {/* Schedule configuration (when not always open) */}
        {!isAlwaysOpen && (
          <div className="space-y-4">
            {/* Schedule type selector */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant={scheduleType === "specific_days" ? "default" : "outline"}
                size="sm"
                onClick={() => updateState({ scheduleType: "specific_days" })}
                className="flex-1"
              >
                <Repeat className="h-4 w-4 mr-2" />
                Jours récurrents
              </Button>
              <Button
                type="button"
                variant={scheduleType === "one_time" ? "default" : "outline"}
                size="sm"
                onClick={() => updateState({ scheduleType: "one_time" })}
                className="flex-1"
              >
                <CalendarCheck className="h-4 w-4 mr-2" />
                Dates spécifiques
              </Button>
            </div>

            {/* Recurring days configuration */}
            {scheduleType === "specific_days" && (
              <div className="space-y-4 p-4 border rounded-lg bg-muted/10">
                {/* Days of week */}
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                    Jours de la semaine
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map(day => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => handleDayToggle(day.value)}
                        className={cn(
                          "px-3 py-2 text-sm rounded-md border transition-colors",
                          selectedDays.includes(day.value)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-muted border-input"
                        )}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                  {selectedDays.length === 0 && (
                    <p className="text-xs text-destructive">Sélectionnez au moins un jour</p>
                  )}
                </div>

                {/* Start date */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center gap-1.5">
                      <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      À partir du
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !recurringStartDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {recurringStartDate
                            ? format(recurringStartDate, "d MMM yyyy", { locale: fr })
                            : "Aujourd'hui"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={recurringStartDate}
                          onSelect={(date) => updateState({ recurringStartDate: date })}
                          locale={fr}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* End date (optional) */}
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center gap-1.5">
                      <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      Jusqu'au (optionnel)
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !recurringEndDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {recurringEndDate
                            ? format(recurringEndDate, "d MMM yyyy", { locale: fr })
                            : "Indéfiniment"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={recurringEndDate}
                          onSelect={(date) => updateState({ recurringEndDate: date })}
                          locale={fr}
                          disabled={(date) =>
                            recurringStartDate ? date < recurringStartDate : false
                          }
                        />
                      </PopoverContent>
                    </Popover>
                    {recurringEndDate && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => updateState({ recurringEndDate: undefined })}
                        className="text-xs text-muted-foreground"
                      >
                        <X className="h-3 w-3 mr-1" />
                        Supprimer la date de fin
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Specific dates configuration */}
            {scheduleType === "one_time" && (
              <div className="space-y-4 p-4 border rounded-lg bg-muted/10">
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-1.5">
                    <CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />
                    Sélectionner les dates
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        Ajouter une date
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        onSelect={handleSpecificDateSelect}
                        locale={fr}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        modifiers={{
                          selected: specificDates,
                        }}
                        modifiersStyles={{
                          selected: {
                            backgroundColor: "hsl(var(--primary))",
                            color: "hsl(var(--primary-foreground))",
                          },
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Selected dates list */}
                {specificDates.length > 0 ? (
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center gap-1.5">
                      <CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />
                      Dates sélectionnées ({specificDates.length})
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {specificDates.map((date, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm"
                        >
                          {format(date, "d MMM yyyy", { locale: fr })}
                          <button
                            type="button"
                            onClick={() => removeSpecificDate(index)}
                            className="ml-1 hover:bg-primary/20 rounded-full p-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-destructive">Sélectionnez au moins une date</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
