import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
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
import { CalendarIcon, Loader2, X, Repeat } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Database } from "@/integrations/supabase/types";

type ScheduleType = Database["public"]["Enums"]["schedule_type"];

interface VenueScheduleData {
  id?: string;
  schedule_type: ScheduleType;
  days_of_week: number[] | null;
  recurring_start_date: string | null;
  recurring_end_date: string | null;
  specific_dates: string[] | null;
  recurrence_interval: number;
}

interface VenueDeploymentScheduleFormProps {
  hotelId: string;
}

const DAYS_OF_WEEK = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
  { value: 0, label: "Dim" },
];

const RECURRENCE_OPTIONS = [
  { value: 1, label: "Chaque semaine" },
  { value: 2, label: "Toutes les 2 semaines" },
  { value: 3, label: "Toutes les 3 semaines" },
  { value: 4, label: "Toutes les 4 semaines" },
];

export function VenueDeploymentScheduleForm({ hotelId }: VenueDeploymentScheduleFormProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scheduleData, setScheduleData] = useState<VenueScheduleData | null>(null);

  // Form state
  const [isAlwaysOpen, setIsAlwaysOpen] = useState(true);
  const [scheduleType, setScheduleType] = useState<"specific_days" | "one_time">("specific_days");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [recurringStartDate, setRecurringStartDate] = useState<Date | undefined>(undefined);
  const [recurringEndDate, setRecurringEndDate] = useState<Date | undefined>(undefined);
  const [specificDates, setSpecificDates] = useState<Date[]>([]);
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);

  useEffect(() => {
    loadSchedule();
  }, [hotelId]);

  const loadSchedule = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("venue_deployment_schedules")
        .select("*")
        .eq("hotel_id", hotelId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setScheduleData(data);
        setIsAlwaysOpen(data.schedule_type === "always_open");
        setRecurrenceInterval(data.recurrence_interval || 1);

        if (data.schedule_type === "specific_days") {
          setScheduleType("specific_days");
          setSelectedDays(data.days_of_week || []);
          setRecurringStartDate(data.recurring_start_date ? new Date(data.recurring_start_date) : undefined);
          setRecurringEndDate(data.recurring_end_date ? new Date(data.recurring_end_date) : undefined);
        } else if (data.schedule_type === "one_time") {
          setScheduleType("one_time");
          setSpecificDates((data.specific_dates || []).map(d => new Date(d)));
        }
      }
    } catch (error) {
      console.error("Error loading schedule:", error);
      toast.error("Erreur lors du chargement du planning");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const schedulePayload: Omit<VenueScheduleData, "id"> & { hotel_id: string } = {
        hotel_id: hotelId,
        schedule_type: isAlwaysOpen ? "always_open" : scheduleType,
        days_of_week: null,
        recurring_start_date: null,
        recurring_end_date: null,
        specific_dates: null,
        recurrence_interval: isAlwaysOpen ? 1 : (scheduleType === "specific_days" ? recurrenceInterval : 1),
      };

      if (!isAlwaysOpen) {
        if (scheduleType === "specific_days") {
          if (selectedDays.length === 0) {
            toast.error("Veuillez sélectionner au moins un jour");
            return;
          }
          schedulePayload.days_of_week = selectedDays;
          schedulePayload.recurring_start_date = recurringStartDate
            ? format(recurringStartDate, "yyyy-MM-dd")
            : format(new Date(), "yyyy-MM-dd");
          schedulePayload.recurring_end_date = recurringEndDate
            ? format(recurringEndDate, "yyyy-MM-dd")
            : null;
        } else if (scheduleType === "one_time") {
          if (specificDates.length === 0) {
            toast.error("Veuillez sélectionner au moins une date");
            return;
          }
          schedulePayload.specific_dates = specificDates.map(d => format(d, "yyyy-MM-dd"));
        }
      }

      if (scheduleData?.id) {
        // Update existing
        const { error } = await supabase
          .from("venue_deployment_schedules")
          .update(schedulePayload)
          .eq("id", scheduleData.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from("venue_deployment_schedules")
          .insert(schedulePayload);

        if (error) throw error;
      }

      toast.success("Planning de déploiement enregistré");
      loadSchedule();
    } catch (error) {
      console.error("Error saving schedule:", error);
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleDayToggle = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSpecificDateSelect = (date: Date | undefined) => {
    if (!date) return;

    const dateStr = format(date, "yyyy-MM-dd");
    const existingIndex = specificDates.findIndex(
      d => format(d, "yyyy-MM-dd") === dateStr
    );

    if (existingIndex >= 0) {
      setSpecificDates(prev => prev.filter((_, i) => i !== existingIndex));
    } else {
      setSpecificDates(prev => [...prev, date].sort((a, b) => a.getTime() - b.getTime()));
    }
  };

  const removeSpecificDate = (index: number) => {
    setSpecificDates(prev => prev.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 border rounded-lg bg-muted/20">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-base font-medium">Planning de déploiement</Label>
          <p className="text-sm text-muted-foreground mt-1">
            Définissez quand ce lieu est disponible pour les réservations
          </p>
        </div>
      </div>

      {/* Always open switch */}
      <div className="flex items-center justify-between py-2">
        <Label htmlFor="always-open" className="cursor-pointer">
          Toujours disponible
        </Label>
        <Switch
          id="always-open"
          checked={isAlwaysOpen}
          onCheckedChange={setIsAlwaysOpen}
        />
      </div>

      {/* Schedule configuration (when not always open) */}
      {!isAlwaysOpen && (
        <div className="space-y-4 pt-2 border-t">
          {/* Schedule type selector */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={scheduleType === "specific_days" ? "default" : "outline"}
              size="sm"
              onClick={() => setScheduleType("specific_days")}
              className="flex-1"
            >
              Jours récurrents
            </Button>
            <Button
              type="button"
              variant={scheduleType === "one_time" ? "default" : "outline"}
              size="sm"
              onClick={() => setScheduleType("one_time")}
              className="flex-1"
            >
              Dates spécifiques
            </Button>
          </div>

          {/* Recurring days configuration */}
          {scheduleType === "specific_days" && (
            <div className="space-y-4">
              {/* Days of week */}
              <div className="space-y-2">
                <Label className="text-sm">Jours de la semaine</Label>
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
              </div>

              {/* Recurrence Interval */}
              <div className="space-y-2">
                <Label className="text-sm flex items-center gap-1.5">
                  <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
                  Fréquence de récurrence
                </Label>
                <Select
                  value={recurrenceInterval.toString()}
                  onValueChange={(value) => setRecurrenceInterval(parseInt(value, 10))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Chaque semaine" />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value.toString()}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {recurrenceInterval > 1 && (
                  <p className="text-xs text-muted-foreground">
                    Le lieu sera disponible toutes les {recurrenceInterval} semaines, à partir de la date de début.
                  </p>
                )}
              </div>

              {/* Start date */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">À partir du</Label>
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
                        onSelect={setRecurringStartDate}
                        locale={fr}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* End date (optional) */}
                <div className="space-y-2">
                  <Label className="text-sm">Jusqu'au (optionnel)</Label>
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
                        onSelect={setRecurringEndDate}
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
                      onClick={() => setRecurringEndDate(undefined)}
                      className="text-xs text-muted-foreground"
                    >
                      Supprimer la date de fin
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Specific dates configuration */}
          {scheduleType === "one_time" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">Sélectionner les dates</Label>
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
              {specificDates.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm">Dates sélectionnées ({specificDates.length})</Label>
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
              )}
            </div>
          )}
        </div>
      )}

      {/* Save button */}
      <Button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full"
      >
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Enregistrer le planning
      </Button>
    </div>
  );
}
