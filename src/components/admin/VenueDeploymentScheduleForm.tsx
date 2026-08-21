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
import { useTranslation } from "react-i18next";
import { useDateLocale } from "@/lib/dateLocale";
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
  { value: 1, key: "mon" },
  { value: 2, key: "tue" },
  { value: 3, key: "wed" },
  { value: 4, key: "thu" },
  { value: 5, key: "fri" },
  { value: 6, key: "sat" },
  { value: 0, key: "sun" },
];

const RECURRENCE_OPTIONS = [1, 2, 3, 4];

export function VenueDeploymentScheduleForm({ hotelId }: VenueDeploymentScheduleFormProps) {
  const { t } = useTranslation(['admin', 'common']);
  const dateLocale = useDateLocale();
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
      toast.error(t('deploymentForm.loadError'));
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
            toast.error(t('venue.deployment.errorSelectDay'));
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
            toast.error(t('venue.deployment.errorSelectDate'));
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

      toast.success(t('deploymentForm.saved'));
      loadSchedule();
    } catch (error) {
      console.error("Error saving schedule:", error);
      toast.error(t('deploymentForm.saveError'));
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
          <Label className="text-base font-medium">{t('venue.deployment.scheduleTitle')}</Label>
          <p className="text-sm text-muted-foreground mt-1">
            {t('deploymentForm.desc')}
          </p>
        </div>
      </div>

      {/* Always open switch */}
      <div className="flex items-center justify-between py-2">
        <Label htmlFor="always-open" className="cursor-pointer">
          {t('venue.deployment.alwaysAvailable')}
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
              {t('venue.deployment.recurringDays')}
            </Button>
            <Button
              type="button"
              variant={scheduleType === "one_time" ? "default" : "outline"}
              size="sm"
              onClick={() => setScheduleType("one_time")}
              className="flex-1"
            >
              {t('venue.deployment.specificDates')}
            </Button>
          </div>

          {/* Recurring days configuration */}
          {scheduleType === "specific_days" && (
            <div className="space-y-4">
              {/* Days of week */}
              <div className="space-y-2">
                <Label className="text-sm">{t('venue.deployment.weekDays')}</Label>
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
                      {t(`venue.deployment.days.${day.key}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recurrence Interval */}
              <div className="space-y-2">
                <Label className="text-sm flex items-center gap-1.5">
                  <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
                  {t('venue.deployment.recurrenceFrequency')}
                </Label>
                <Select
                  value={recurrenceInterval.toString()}
                  onValueChange={(value) => setRecurrenceInterval(parseInt(value, 10))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('venue.deployment.recurrence.every1')} />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_OPTIONS.map(option => (
                      <SelectItem key={option} value={option.toString()}>
                        {t(`venue.deployment.recurrence.every${option}`)}
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
                  <Label className="text-sm">{t('venue.deployment.fromDate')}</Label>
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
                          ? format(recurringStartDate, "d MMM yyyy", { locale: dateLocale })
                          : "Aujourd'hui"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={recurringStartDate}
                        onSelect={setRecurringStartDate}
                        locale={dateLocale}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* End date (optional) */}
                <div className="space-y-2">
                  <Label className="text-sm">{t('venue.deployment.untilDate')}</Label>
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
                          ? format(recurringEndDate, "d MMM yyyy", { locale: dateLocale })
                          : "Indéfiniment"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={recurringEndDate}
                        onSelect={setRecurringEndDate}
                        locale={dateLocale}
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
                      {t('venue.deployment.removeEndDate')}
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
                <Label className="text-sm">{t('venue.deployment.selectDates')}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {t('venue.deployment.addDate')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      onSelect={handleSpecificDateSelect}
                      locale={dateLocale}
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
                        {format(date, "d MMM yyyy", { locale: dateLocale })}
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
