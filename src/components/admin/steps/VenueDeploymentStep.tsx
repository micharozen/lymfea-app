import { useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  Ban,
  Plus,
} from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { useDateLocale } from "@/lib/dateLocale";
import { cn } from "@/lib/utils";
import { VenueWizardFormValues, BlockedSlot } from "../VenueWizardDialog";
import { toast } from "sonner";

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

// Blocked slots use separate hour/minute selects for finer granularity (5-min steps)
const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));

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
  recurrenceInterval: number;
}

interface VenueDeploymentStepProps {
  form: UseFormReturn<VenueWizardFormValues>;
  state: DeploymentScheduleState;
  onChange: (state: DeploymentScheduleState) => void;
  blockedSlots: BlockedSlot[];
  onBlockedSlotsChange: (slots: BlockedSlot[]) => void;
  disabled?: boolean;
}

export function VenueDeploymentStep({ form, state, onChange, blockedSlots, onBlockedSlotsChange, disabled = false }: VenueDeploymentStepProps) {
  const { t } = useTranslation(['admin', 'common']);
  const dateLocale = useDateLocale();
  const {
    isAlwaysOpen,
    scheduleType,
    selectedDays,
    recurringStartDate,
    recurringEndDate,
    specificDates,
    recurrenceInterval,
  } = state;

  // Blocked slots local state
  const [showAddBlockedSlot, setShowAddBlockedSlot] = useState(false);
  const [newBlockedSlot, setNewBlockedSlot] = useState<Omit<BlockedSlot, 'id'>>({
    label: '',
    start_time: '12:00',
    end_time: '13:00',
    days_of_week: null,
    is_active: true,
  });

  const addBlockedSlot = () => {
    if (!newBlockedSlot.label || !newBlockedSlot.start_time || !newBlockedSlot.end_time) {
      toast.error(t('venue.deployment.errorRequiredFields'));
      return;
    }
    if (newBlockedSlot.start_time >= newBlockedSlot.end_time) {
      toast.error(t('venue.deployment.errorStartBeforeEnd'));
      return;
    }
    if (newBlockedSlot.days_of_week !== null && newBlockedSlot.days_of_week.length === 0) {
      toast.error(t('venue.deployment.errorSelectDay'));
      return;
    }
    onBlockedSlotsChange([...blockedSlots, { ...newBlockedSlot }]);
    setNewBlockedSlot({ label: '', start_time: '12:00', end_time: '13:00', days_of_week: null, is_active: true });
    setShowAddBlockedSlot(false);
  };

  const removeBlockedSlot = (index: number) => {
    onBlockedSlotsChange(blockedSlots.filter((_, i) => i !== index));
  };

  const toggleNewBlockedSlotDay = (day: number) => {
    const current = newBlockedSlot.days_of_week || [];
    const updated = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day];
    setNewBlockedSlot(prev => ({ ...prev, days_of_week: updated }));
  };

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
        <SectionHeader icon={Clock} title={t('venue.deployment.hoursTitle')} />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="opening_time"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  {t('venue.deployment.openingTime')}
                </FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
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
                  {t('venue.deployment.closingTime')}
                </FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
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

        <FormField
          control={form.control}
          name="slot_interval"
          render={({ field }) => (
            <FormItem className="mt-4">
              <FormLabel className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                {t('venue.deployment.slotInterval')}
              </FormLabel>
              <Select
                value={String(field.value ?? 30)}
                onValueChange={(val) => field.onChange(Number(val))}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[15, 20, 30, 45, 60].map((minutes) => (
                    <SelectItem key={minutes} value={String(minutes)}>
                      {minutes} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Blocked time slots section */}
      <div>
        <SectionHeader icon={Ban} title={t('venue.deployment.blockedSlotsTitle')} />

        {blockedSlots.length > 0 && (
          <div className="space-y-2 mb-4">
            {blockedSlots.map((slot, index) => (
              <div
                key={slot.id || index}
                className="flex items-center justify-between p-3 border rounded-lg bg-muted/10"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-medium">{slot.label}</span>
                  <span className="text-sm text-muted-foreground">
                    {slot.start_time} - {slot.end_time}
                  </span>
                  {slot.days_of_week ? (
                    <div className="flex gap-1">
                      {DAYS_OF_WEEK.filter(d => slot.days_of_week!.includes(d.value)).map(d => (
                        <span key={d.value} className="text-xs px-1.5 py-0.5 bg-muted rounded">
                          {t(`venue.deployment.days.${d.key}`)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t('venue.deployment.everyDay')}</span>
                  )}
                </div>
                {!disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeBlockedSlot(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {!disabled && (
          showAddBlockedSlot ? (
            <div className="p-4 border rounded-lg bg-muted/10 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm">{t('venue.deployment.slotName')}</Label>
                <Input
                  value={newBlockedSlot.label}
                  onChange={(e) => setNewBlockedSlot(prev => ({ ...prev, label: e.target.value }))}
                  placeholder={t('venue.deployment.slotNamePlaceholder')}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('venue.deployment.start')}</Label>
                  <div className="flex gap-1.5">
                    <Select
                      value={newBlockedSlot.start_time.split(':')[0]}
                      onValueChange={(h) => setNewBlockedSlot(prev => ({ ...prev, start_time: `${h}:${prev.start_time.split(':')[1]}` }))}
                    >
                      <SelectTrigger className="w-[70px]">
                        <SelectValue placeholder="HH" />
                      </SelectTrigger>
                      <SelectContent>
                        {HOURS.map(h => (
                          <SelectItem key={h} value={h}>{h}h</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={newBlockedSlot.start_time.split(':')[1]}
                      onValueChange={(m) => setNewBlockedSlot(prev => ({ ...prev, start_time: `${prev.start_time.split(':')[0]}:${m}` }))}
                    >
                      <SelectTrigger className="w-[70px]">
                        <SelectValue placeholder="MM" />
                      </SelectTrigger>
                      <SelectContent>
                        {MINUTES.map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('venue.deployment.end')}</Label>
                  <div className="flex gap-1.5">
                    <Select
                      value={newBlockedSlot.end_time.split(':')[0]}
                      onValueChange={(h) => setNewBlockedSlot(prev => ({ ...prev, end_time: `${h}:${prev.end_time.split(':')[1]}` }))}
                    >
                      <SelectTrigger className="w-[70px]">
                        <SelectValue placeholder="HH" />
                      </SelectTrigger>
                      <SelectContent>
                        {HOURS.map(h => (
                          <SelectItem key={h} value={h}>{h}h</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={newBlockedSlot.end_time.split(':')[1]}
                      onValueChange={(m) => setNewBlockedSlot(prev => ({ ...prev, end_time: `${prev.end_time.split(':')[0]}:${m}` }))}
                    >
                      <SelectTrigger className="w-[70px]">
                        <SelectValue placeholder="MM" />
                      </SelectTrigger>
                      <SelectContent>
                        {MINUTES.map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label className="text-sm">{t('venue.deployment.specificDays')}</Label>
                  <Switch
                    checked={newBlockedSlot.days_of_week !== null}
                    onCheckedChange={(checked) =>
                      setNewBlockedSlot(prev => ({
                        ...prev,
                        days_of_week: checked ? [] : null,
                      }))
                    }
                  />
                </div>
                {newBlockedSlot.days_of_week !== null && (
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map(day => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleNewBlockedSlotDay(day.value)}
                        className={cn(
                          "px-3 py-2 text-sm rounded-md border transition-colors",
                          newBlockedSlot.days_of_week?.includes(day.value)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-muted border-input"
                        )}
                      >
                        {t(`venue.deployment.days.${day.key}`)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddBlockedSlot(false)}
                >
                  {t('common:buttons.cancel')}
                </Button>
                <Button type="button" size="sm" onClick={addBlockedSlot}>
                  {t('common:buttons.add')}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddBlockedSlot(true)}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('venue.deployment.addBlockedSlot')}
            </Button>
          )
        )}
      </div>

      {/* Deployment schedule section */}
      <div>
        <SectionHeader icon={CalendarDays} title={t('venue.deployment.scheduleTitle')} />

        {/* Always open switch */}
        <div className="flex items-center justify-between py-3 px-4 border rounded-lg bg-muted/20 mb-4">
          <Label htmlFor="always-open" className="cursor-pointer flex items-center gap-2">
            <ToggleLeft className="h-4 w-4 text-muted-foreground" />
            {t('venue.deployment.alwaysAvailable')}
          </Label>
          <Switch
            id="always-open"
            checked={isAlwaysOpen}
            onCheckedChange={(checked) => updateState({ isAlwaysOpen: checked })}
            disabled={disabled}
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
                disabled={disabled}
                className="flex-1"
              >
                <Repeat className="h-4 w-4 mr-2" />
                {t('venue.deployment.recurringDays')}
              </Button>
              <Button
                type="button"
                variant={scheduleType === "one_time" ? "default" : "outline"}
                size="sm"
                onClick={() => updateState({ scheduleType: "one_time" })}
                disabled={disabled}
                className="flex-1"
              >
                <CalendarCheck className="h-4 w-4 mr-2" />
                {t('venue.deployment.specificDates')}
              </Button>
            </div>

            {/* Recurring days configuration */}
            {scheduleType === "specific_days" && (
              <div className="space-y-4 p-4 border rounded-lg bg-muted/10">
                {/* Days of week */}
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                    {t('venue.deployment.weekDays')}
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map(day => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => !disabled && handleDayToggle(day.value)}
                        disabled={disabled}
                        className={cn(
                          "px-3 py-2 text-sm rounded-md border transition-colors",
                          disabled && "cursor-not-allowed opacity-60",
                          selectedDays.includes(day.value)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-input",
                          !disabled && !selectedDays.includes(day.value) && "hover:bg-muted"
                        )}
                      >
                        {t(`venue.deployment.days.${day.key}`)}
                      </button>
                    ))}
                  </div>
                  {selectedDays.length === 0 && (
                    <p className="text-xs text-destructive">{t('venue.deployment.errorSelectDay')}</p>
                  )}
                </div>

                {/* Recurrence Interval */}
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-1.5">
                    <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
                    {t('venue.deployment.recurrenceFrequency')}
                  </Label>
                  <Select
                    value={recurrenceInterval.toString()}
                    onValueChange={(value) => updateState({ recurrenceInterval: parseInt(value, 10) })}
                    disabled={disabled}
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
                      {t('venue.deployment.recurrenceNote', { count: recurrenceInterval })}
                    </p>
                  )}
                </div>

                {/* Start date */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center gap-1.5">
                      <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      {t('venue.deployment.fromDate')}
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          disabled={disabled}
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !recurringStartDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {recurringStartDate
                            ? format(recurringStartDate, "d MMM yyyy", { locale: dateLocale })
                            : t('venue.deployment.today')}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={recurringStartDate}
                          onSelect={(date) => updateState({ recurringStartDate: date })}
                          locale={dateLocale}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* End date (optional) */}
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center gap-1.5">
                      <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      {t('venue.deployment.untilDate')}
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          disabled={disabled}
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !recurringEndDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {recurringEndDate
                            ? format(recurringEndDate, "d MMM yyyy", { locale: dateLocale })
                            : t('venue.deployment.indefinitely')}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={recurringEndDate}
                          onSelect={(date) => updateState({ recurringEndDate: date })}
                          locale={dateLocale}
                          disabled={(date) =>
                            recurringStartDate ? date < recurringStartDate : false
                          }
                        />
                      </PopoverContent>
                    </Popover>
                    {recurringEndDate && !disabled && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => updateState({ recurringEndDate: undefined })}
                        className="text-xs text-muted-foreground"
                      >
                        <X className="h-3 w-3 mr-1" />
                        {t('venue.deployment.removeEndDate')}
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
                    {t('venue.deployment.selectDates')}
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" disabled={disabled} className="w-full justify-start">
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
                {specificDates.length > 0 ? (
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center gap-1.5">
                      <CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />
                      {t('venue.deployment.selectedDates', { count: specificDates.length })}
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {specificDates.map((date, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm"
                        >
                          {format(date, "d MMM yyyy", { locale: dateLocale })}
                          {!disabled && (
                            <button
                              type="button"
                              onClick={() => removeSpecificDate(index)}
                              className="ml-1 hover:bg-primary/20 rounded-full p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-destructive">{t('venue.deployment.errorSelectDate')}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
