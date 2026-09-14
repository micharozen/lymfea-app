import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO } from "date-fns";
import { useDateLocale } from "@/lib/dateLocale";
import type { DateRange } from "react-day-picker";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Ban, Calendar as CalendarIcon, CalendarDays, Check, CheckCheck, CheckCircle2, Clock, FilterX, List, Search, SlidersHorizontal, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Hotel, Therapist } from "@/hooks/booking";
import { MultiSelectFilter } from "./MultiSelectFilter";
import {
  paymentMethodFilterOptions,
  paymentStatusFilterOptions,
} from "@/lib/paymentMethod";

/** Planning layout: days side by side, or one column per therapist for one day. */
export type PlanningMode = "day" | "therapists";

/**
 * Filtres que l'utilisateur peut afficher ou masquer via le bouton "Filtres".
 * Le choix est mémorisé en localStorage : la barre reste légère et chacun
 * garde sa configuration d'un écran à l'autre.
 */
type FilterKey = "hotel" | "status" | "payment" | "paymentStatus" | "period" | "therapist";

const TOGGLEABLE_FILTERS: { key: FilterKey; labelKey: string }[] = [
  { key: "hotel", labelKey: "bookingFilters.toggles.hotel" },
  { key: "status", labelKey: "bookingFilters.toggles.status" },
  { key: "therapist", labelKey: "bookingFilters.toggles.therapist" },
  { key: "period", labelKey: "bookingFilters.toggles.period" },
  { key: "payment", labelKey: "bookingFilters.toggles.payment" },
  { key: "paymentStatus", labelKey: "bookingFilters.toggles.paymentStatus" },
];

// Configuration par défaut = la barre telle qu'elle existait avant le sélecteur.
const DEFAULT_VISIBLE_FILTERS: FilterKey[] = ["hotel", "status", "therapist", "period"];

function readVisibleFilters(storageKey: string | undefined): FilterKey[] {
  if (!storageKey) return DEFAULT_VISIBLE_FILTERS;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_VISIBLE_FILTERS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_VISIBLE_FILTERS;
    const known = TOGGLEABLE_FILTERS.map((f) => f.key);
    return parsed.filter((k): k is FilterKey => known.includes(k));
  } catch {
    return DEFAULT_VISIBLE_FILTERS;
  }
}

const formatIsoShort = (iso: string) => format(parseISO(iso), "dd/MM");

// Référence stable : un littéral [] par rendu invaliderait les mémos en aval.
const EMPTY_SELECTION: string[] = [];

// Status filter options with a pastel background + icon per value.
const STATUS_FILTER_OPTIONS = [
  { value: "pending", labelKey: "status.pending", Icon: Clock, className: "bg-orange-50 text-orange-900 focus:bg-orange-100 focus:text-orange-900" },
  { value: "confirmed", labelKey: "status.confirmed", Icon: CheckCircle2, className: "bg-emerald-50 text-emerald-900 focus:bg-emerald-100 focus:text-emerald-900" },
  { value: "completed", labelKey: "status.completed", Icon: CheckCheck, className: "bg-emerald-50/60 text-emerald-800 focus:bg-emerald-100 focus:text-emerald-900" },
  { value: "cancelled", labelKey: "status.cancelled", Icon: Ban, className: "bg-gray-100 text-red-600 focus:bg-gray-200 focus:text-red-700" },
] as const;

interface BookingFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  /** Multi-select filters: an empty array means "no restriction". */
  statusFilter: string[];
  onStatusChange: (value: string[]) => void;
  hotelFilter: string[];
  onHotelChange: (value: string[]) => void;
  therapistFilter: string[];
  onTherapistChange: (value: string[]) => void;
  /** Payment filters. Omit the handlers to hide the selects (calendar view). */
  paymentMethodFilter?: string[];
  onPaymentMethodChange?: (value: string[]) => void;
  paymentStatusFilter?: string[];
  onPaymentStatusChange?: (value: string[]) => void;
  view: "calendar" | "list";
  onViewChange: (view: "calendar" | "list") => void;
  dayCount: number;
  onDayCountChange: (count: number) => void;
  isAdmin: boolean;
  hotels: Hotel[] | undefined;
  therapists: Therapist[] | undefined;
  hideHotelFilter?: boolean;
  hideViewToggle?: boolean;
  hideSearch?: boolean;
  /** Push the filter selects to the right so they sit next to the view controls. */
  groupFiltersRight?: boolean;
  showAvailability?: boolean;
  onShowAvailabilityChange?: (show: boolean) => void;
  /**
   * Planning layout: days side by side, or one column per therapist for a single
   * day. Provide the handler to expose the switch (calendar view only).
   */
  planningMode?: PlanningMode;
  onPlanningModeChange?: (mode: PlanningMode) => void;
  /**
   * Explicit date window (ISO YYYY-MM-DD) restricting the list. Provide the
   * handler to expose the date-range button.
   */
  customRange?: { from: string; to: string } | null;
  onCustomRangeChange?: (range: { from: string; to: string } | null) => void;
  /**
   * localStorage key holding which filters are pinned to the toolbar. Provide it
   * to expose the "Filtres" button; omit it to render every filter (calendar view).
   */
  filterVisibilityStorageKey?: string;
  /**
   * Vide tous les filtres d'un coup (recherche incluse). Fournir le handler
   * expose le bouton "Réinitialiser", visible seulement si un filtre est actif.
   */
  onResetFilters?: () => void;
  /** Optional content rendered at the start of the toolbar (e.g. page title). */
  leading?: ReactNode;
  /** Optional content rendered at the end of the toolbar, after the view toggle (e.g. action buttons). */
  trailing?: ReactNode;
}

export function BookingFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  hotelFilter,
  onHotelChange,
  therapistFilter,
  onTherapistChange,
  paymentMethodFilter = EMPTY_SELECTION,
  onPaymentMethodChange,
  paymentStatusFilter = EMPTY_SELECTION,
  onPaymentStatusChange,
  view,
  onViewChange,
  dayCount,
  onDayCountChange,
  isAdmin,
  hotels,
  therapists,
  hideHotelFilter = false,
  hideViewToggle = false,
  hideSearch = false,
  groupFiltersRight = false,
  showAvailability,
  onShowAvailabilityChange,
  planningMode = "day",
  onPlanningModeChange,
  customRange = null,
  onCustomRangeChange,
  filterVisibilityStorageKey,
  onResetFilters,
  leading,
  trailing,
}: BookingFiltersProps) {
  const { t } = useTranslation(["admin", "common"]);
  const dateLocale = useDateLocale();
  const [customPeriodOpen, setCustomPeriodOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(() =>
    customRange
      ? { from: parseISO(customRange.from), to: parseISO(customRange.to) }
      : undefined
  );

  const [visibleFilters, setVisibleFilters] = useState<FilterKey[]>(() =>
    readVisibleFilters(filterVisibilityStorageKey)
  );
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  // Sans clé de stockage (vue calendrier), tous les filtres restent affichés.
  const isVisible = (key: FilterKey) =>
    !filterVisibilityStorageKey || visibleFilters.includes(key);

  // Masquer un filtre le réinitialise : un filtre actif mais invisible
  // restreindrait la liste sans que personne puisse le voir.
  const toggleFilter = (key: FilterKey) => {
    const next = visibleFilters.includes(key)
      ? visibleFilters.filter((k) => k !== key)
      : [...visibleFilters, key];
    setVisibleFilters(next);
    if (filterVisibilityStorageKey) {
      try {
        localStorage.setItem(filterVisibilityStorageKey, JSON.stringify(next));
      } catch {
        // localStorage indisponible (mode privé, quota) : on ignore.
      }
    }
    if (!next.includes(key)) {
      if (key === "hotel") onHotelChange([]);
      if (key === "status") onStatusChange([]);
      if (key === "therapist") onTherapistChange([]);
      if (key === "payment") onPaymentMethodChange?.([]);
      if (key === "paymentStatus") onPaymentStatusChange?.([]);
      if (key === "period") onCustomRangeChange?.(null);
    }
  };

  // Compteur affiché sur le bouton : nombre de valeurs réellement sélectionnées,
  // et non de filtres actifs — sélectionner 3 statuts compte pour 3.
  const activeFilterCount =
    hotelFilter.length +
    statusFilter.length +
    therapistFilter.length +
    paymentMethodFilter.length +
    paymentStatusFilter.length +
    (customRange ? 1 : 0);

  // La recherche compte comme un filtre actif ici (elle restreint la liste et
  // le reset l'efface), même si elle n'entre pas dans le badge ci-dessus.
  const hasActiveFilters = activeFilterCount > 0 || searchQuery.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-border">
      {leading}

      {!hideSearch && (
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={t("common:buttons.search") + "..."}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-8 w-[160px] text-xs"
          />
        </div>
      )}

      {filterVisibilityStorageKey && (
        <Popover open={filterMenuOpen} onOpenChange={setFilterMenuOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-normal">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {t("bookingFilters.filters")}
              {activeFilterCount > 0 && (
                <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[10px] leading-4 text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-1" align="start">
            {TOGGLEABLE_FILTERS.map(({ key, labelKey }) => (
              <button
                key={key}
                onClick={() => toggleFilter(key)}
                className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs hover:bg-secondary/50"
              >
                <span>{t(labelKey)}</span>
                <Check
                  className={cn(
                    "h-3.5 w-3.5",
                    visibleFilters.includes(key) ? "opacity-100" : "opacity-0"
                  )}
                />
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}

      {isVisible("hotel") && isAdmin && !hideHotelFilter && (
        <MultiSelectFilter
          value={hotelFilter}
          onChange={onHotelChange}
          allLabel={t("bookingFilters.allVenues")}
          searchPlaceholder={t("bookingFilters.searchVenue")}
          emptyLabel={t("bookingFilters.noVenueFound")}
          triggerClassName={cn(groupFiltersRight && "ml-auto")}
          options={(hotels ?? []).map((hotel) => ({
            value: hotel.id,
            label: hotel.name,
            adornment: (
              <span
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0 mr-1.5"
                style={{ backgroundColor: hotel.calendar_color || "#3b82f6" }}
              />
            ),
          }))}
        />
      )}

      {isVisible("status") && (
        <MultiSelectFilter
          value={statusFilter}
          onChange={onStatusChange}
          allLabel={t("bookingFilters.allStatuses")}
          triggerClassName={cn(
            groupFiltersRight && (!isAdmin || hideHotelFilter) && "ml-auto"
          )}
          options={STATUS_FILTER_OPTIONS.map(({ value, labelKey, Icon, className }) => ({
            value,
            label: t(`common:${labelKey}`),
            className,
            adornment: <Icon className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />,
          }))}
        />
      )}

      {isVisible("payment") && onPaymentMethodChange && (
        <MultiSelectFilter
          value={paymentMethodFilter}
          onChange={onPaymentMethodChange}
          allLabel={t("bookingFilters.allPaymentMethods")}
          options={paymentMethodFilterOptions()}
          triggerClassName="w-[170px]"
        />
      )}

      {isVisible("paymentStatus") && onPaymentStatusChange && (
        <MultiSelectFilter
          value={paymentStatusFilter}
          onChange={onPaymentStatusChange}
          allLabel={t("bookingFilters.allPaymentStatuses")}
          options={paymentStatusFilterOptions()}
          triggerClassName="w-[150px]"
        />
      )}

      {onCustomRangeChange && (
        <Popover open={customPeriodOpen} onOpenChange={setCustomPeriodOpen}>
          <PopoverTrigger asChild>
            {isVisible("period") ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs font-normal"
                onClick={() =>
                  setDraftRange(
                    customRange
                      ? { from: parseISO(customRange.from), to: parseISO(customRange.to) }
                      : undefined
                  )
                }
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {customRange
                  ? `${formatIsoShort(customRange.from)} → ${formatIsoShort(customRange.to)}`
                  : t("bookingFilters.customPeriod")}
              </Button>
            ) : (
              // Filtre masqué : le popover garde une ancre de positionnement.
              <span className="block h-8 w-0" aria-hidden />
            )}
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-3 space-y-3"
            align="start"
            // Le clic extérieur et Échap continuent de fermer normalement.
            onFocusOutside={(e) => e.preventDefault()}
          >
            <p className="text-xs font-medium text-muted-foreground">
              {t("bookingFilters.selectPeriod")}
            </p>
            <Calendar
              mode="range"
              selected={draftRange}
              onSelect={setDraftRange}
              numberOfMonths={1}
              initialFocus
              locale={dateLocale}
              className="p-0 pointer-events-auto"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs"
                onClick={() => {
                  setDraftRange(undefined);
                  onCustomRangeChange(null);
                  setCustomPeriodOpen(false);
                }}
              >
                {t("common:buttons.clear")}
              </Button>
              <Button
                size="sm"
                className="flex-1 text-xs"
                disabled={!draftRange?.from || !draftRange?.to}
                onClick={() => {
                  if (!draftRange?.from || !draftRange?.to) return;
                  onCustomRangeChange({
                    from: format(draftRange.from, "yyyy-MM-dd"),
                    to: format(draftRange.to, "yyyy-MM-dd"),
                  });
                  setCustomPeriodOpen(false);
                }}
              >
                {t("bookingFilters.apply")}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {isVisible("therapist") && isAdmin && (
        <MultiSelectFilter
          value={therapistFilter}
          onChange={onTherapistChange}
          allLabel={t("bookingFilters.allTherapists")}
          searchPlaceholder={t("bookingFilters.searchTherapist")}
          emptyLabel={t("bookingFilters.noTherapistFound")}
          options={(therapists ?? []).map((therapist) => ({
            value: therapist.id,
            label: `${therapist.first_name} ${therapist.last_name}`,
          }))}
        />
      )}

      {onResetFilters && hasActiveFilters && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
              onClick={onResetFilters}
            >
              <FilterX className="h-3.5 w-3.5" />
              {t("bookingFilters.reset")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("bookingFilters.resetTooltip")}</TooltipContent>
        </Tooltip>
      )}

      <div className="flex items-center gap-1.5 ml-auto">
        {onPlanningModeChange && view === "calendar" && (
          <ButtonGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onPlanningModeChange("day")}
                  className={cn(
                    "h-8 w-8",
                    planningMode === "day"
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("planning.dayViewMode")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onPlanningModeChange("therapists")}
                  className={cn(
                    "h-8 w-8",
                    planningMode === "therapists"
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  <Users className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("planning.therapistViewMode")}</TooltipContent>
            </Tooltip>
          </ButtonGroup>
        )}

        {view === "calendar" && planningMode === "day" && (
          <ButtonGroup>
            {[
              { count: 1, label: t("bookingFilters.dayCount", { count: 1 }) },
              { count: 3, label: t("bookingFilters.dayCount", { count: 3 }) },
              { count: 7, label: t("bookingFilters.dayCount", { count: 7 }) },
            ].map((opt) => (
              <Button
                key={opt.count}
                variant="outline"
                size="sm"
                onClick={() => onDayCountChange(opt.count)}
                className={cn(
                  "h-8 px-2.5 text-xs",
                  dayCount === opt.count
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                    : "text-muted-foreground"
                )}
              >
                {opt.label}
              </Button>
            ))}
          </ButtonGroup>
        )}

        {onShowAvailabilityChange && view === "calendar" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => onShowAvailabilityChange(!showAvailability)}
                className={cn(
                  "h-8 w-8",
                  showAvailability
                    ? "bg-emerald-50 border-emerald-300 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
                    : "text-muted-foreground"
                )}
              >
                <Users className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {showAvailability ? t("planning.hideAvailability") : t("planning.showAvailability")}
            </TooltipContent>
          </Tooltip>
        )}

        {!hideViewToggle && (
          <ButtonGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onViewChange("calendar")}
                  className={`h-8 w-8 ${view === "calendar" ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground"}`}
                >
                  <CalendarIcon className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("bookingFilters.calendarView")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onViewChange("list")}
                  className={`h-8 w-8 ${view === "list" ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground"}`}
                >
                  <List className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("bookingFilters.listView")}</TooltipContent>
            </Tooltip>
          </ButtonGroup>
        )}

        {trailing}
      </div>
    </div>
  );
}
