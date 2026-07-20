import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Ban, Calendar as CalendarIcon, Check, CheckCheck, CheckCircle2, Clock, FilterX, List, Search, SlidersHorizontal, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Hotel, Therapist } from "@/hooks/booking";
import { MultiSelectFilter } from "./MultiSelectFilter";
import {
  PAYMENT_METHOD_FILTER_OPTIONS,
  PAYMENT_STATUS_FILTER_OPTIONS,
} from "@/lib/paymentMethod";

const CUSTOM_PERIOD = "custom";

/**
 * Filtres que l'utilisateur peut afficher ou masquer via le bouton "Filtres".
 * Le choix est mémorisé en localStorage : la barre reste légère et chacun
 * garde sa configuration d'un écran à l'autre.
 */
type FilterKey = "hotel" | "status" | "payment" | "paymentStatus" | "period" | "therapist";

const TOGGLEABLE_FILTERS: { key: FilterKey; label: string }[] = [
  { key: "hotel", label: "Lieu" },
  { key: "status", label: "Statut" },
  { key: "therapist", label: "Thérapeute" },
  { key: "period", label: "Période" },
  { key: "payment", label: "Mode de paiement" },
  { key: "paymentStatus", label: "Statut du paiement" },
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
  { value: "pending", label: "En attente", Icon: Clock, className: "bg-orange-50 text-orange-900 focus:bg-orange-100 focus:text-orange-900" },
  { value: "confirmed", label: "Confirmé", Icon: CheckCircle2, className: "bg-emerald-50 text-emerald-900 focus:bg-emerald-100 focus:text-emerald-900" },
  { value: "completed", label: "Terminé", Icon: CheckCheck, className: "bg-emerald-50/60 text-emerald-800 focus:bg-emerald-100 focus:text-emerald-900" },
  { value: "cancelled", label: "Annulé", Icon: Ban, className: "bg-gray-100 text-red-600 focus:bg-gray-200 focus:text-red-700" },
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
  /** Period filter in days (window: [today - N days, future]). Omit to hide the selector. */
  periodDays?: number;
  onPeriodDaysChange?: (days: number) => void;
  /**
   * Explicit date window (ISO YYYY-MM-DD), which overrides periodDays when set.
   * Provide the handler to expose the "custom period" option.
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
  periodDays,
  onPeriodDaysChange,
  customRange = null,
  onCustomRangeChange,
  filterVisibilityStorageKey,
  onResetFilters,
  leading,
  trailing,
}: BookingFiltersProps) {
  const { t } = useTranslation("admin");
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
            placeholder="Rechercher..."
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
              Filtres
              {activeFilterCount > 0 && (
                <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[10px] leading-4 text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-1" align="start">
            {TOGGLEABLE_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => toggleFilter(key)}
                className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs hover:bg-secondary/50"
              >
                <span>{label}</span>
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
          allLabel="Tous les lieux"
          searchPlaceholder="Rechercher un lieu..."
          emptyLabel="Aucun lieu trouvé."
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
          allLabel="Tous les statuts"
          triggerClassName={cn(
            groupFiltersRight && (!isAdmin || hideHotelFilter) && "ml-auto"
          )}
          options={STATUS_FILTER_OPTIONS.map(({ value, label, Icon, className }) => ({
            value,
            label,
            className,
            adornment: <Icon className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />,
          }))}
        />
      )}

      {isVisible("payment") && onPaymentMethodChange && (
        <MultiSelectFilter
          value={paymentMethodFilter}
          onChange={onPaymentMethodChange}
          allLabel="Tous les paiements"
          options={PAYMENT_METHOD_FILTER_OPTIONS}
          triggerClassName="w-[170px]"
        />
      )}

      {isVisible("paymentStatus") && onPaymentStatusChange && (
        <MultiSelectFilter
          value={paymentStatusFilter}
          onChange={onPaymentStatusChange}
          allLabel="Tous les états"
          options={PAYMENT_STATUS_FILTER_OPTIONS}
          triggerClassName="w-[150px]"
        />
      )}

      {isVisible("period") && periodDays !== undefined && onPeriodDaysChange && (
        <Select
          value={customRange ? CUSTOM_PERIOD : String(periodDays)}
          onValueChange={(v) => {
            if (v === CUSTOM_PERIOD) {
              setCustomPeriodOpen(true);
              return;
            }
            onCustomRangeChange?.(null);
            onPeriodDaysChange(Number(v));
          }}
        >
          <SelectTrigger className="w-[170px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10 derniers jours</SelectItem>
            <SelectItem value="30">30 derniers jours</SelectItem>
            <SelectItem value="60">60 derniers jours</SelectItem>
            <SelectItem value="90">90 derniers jours</SelectItem>
            {onCustomRangeChange && (
              <SelectItem value={CUSTOM_PERIOD}>
                {customRange
                  ? `${formatIsoShort(customRange.from)} → ${formatIsoShort(customRange.to)}`
                  : "Période personnalisée"}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      )}

      {onCustomRangeChange && (
        <Popover open={customPeriodOpen} onOpenChange={setCustomPeriodOpen}>
          {/* Ancre de positionnement : le popover est ouvert par l'option
              "Période personnalisée" du Select ci-dessus, pas par un clic ici. */}
          <PopoverTrigger asChild>
            <span className="block h-8 w-0" aria-hidden />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3 space-y-3" align="start">
            <p className="text-xs font-medium text-muted-foreground">
              Sélectionnez une période
            </p>
            <Calendar
              mode="range"
              selected={draftRange}
              onSelect={setDraftRange}
              numberOfMonths={1}
              initialFocus
              locale={fr}
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
                Effacer
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
                Appliquer
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {isVisible("therapist") && isAdmin && (
        <MultiSelectFilter
          value={therapistFilter}
          onChange={onTherapistChange}
          allLabel="Tous les thérapeutes"
          searchPlaceholder="Rechercher un thérapeute..."
          emptyLabel="Aucun thérapeute trouvé."
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
              Réinitialiser
            </Button>
          </TooltipTrigger>
          <TooltipContent>Effacer tous les filtres et la recherche</TooltipContent>
        </Tooltip>
      )}

      <div className="flex items-center gap-1.5 ml-auto">
        {view === "calendar" && (
          <ButtonGroup>
            {[
              { count: 1, label: "1J" },
              { count: 3, label: "3J" },
              { count: 7, label: "7J" },
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
              <TooltipContent side="bottom">Calendrier</TooltipContent>
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
              <TooltipContent side="bottom">Liste</TooltipContent>
            </Tooltip>
          </ButtonGroup>
        )}

        {trailing}
      </div>
    </div>
  );
}
