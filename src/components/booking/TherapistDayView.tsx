import { useMemo, useRef, useEffect } from "react";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronLeft, ChevronRight, CalendarOff, Sparkles, UserX, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SelectField } from "@/components/ui/select-field";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AppLoader } from "@/components/AppLoader";
import { cn } from "@/lib/utils";
import { BookingCard } from "./BookingCalendarView";
import { initials, shortName } from "./therapistDisplay";
import type { BookingWithTreatments, Hotel } from "@/hooks/booking";
import type {
  FreeTherapist,
  TherapistDayColumn,
  TherapistDayPlanning,
  TimeRange,
} from "@/hooks/booking/useTherapistDayPlanning";
import type { VenueTreatmentMenu } from "@/hooks/useVenueTreatmentMenus";

/** Sentinel for the "no treatment searched" option — SelectField needs a value. */
export const ALL_TREATMENTS = "__all__";

interface TherapistDayViewProps {
  date: Date;
  planning: TherapistDayPlanning;
  hours: number[];
  hourHeight: number;
  startHour: number;
  endHour: number;
  onPreviousDay: () => void;
  onNextDay: () => void;
  onGoToToday: () => void;
  onSetDate: (date: Date) => void;
  getBookingPosition: (booking: BookingWithTreatments) => { top: number; height: number };
  getBookingsLayoutForDay: (
    bookings: BookingWithTreatments[],
  ) => Map<string, { column: number; totalColumns: number }>;
  getCurrentTimePosition: (date: Date) => { showIndicator: boolean; position: number };
  getCalendarCardColor: (status: string, paymentStatus?: string | null) => string;
  getStatusColor: (status: string) => string;
  getTranslatedStatus: (status: string) => string;
  getHotelInfo: (hotelId: string | null) => Hotel | null;
  onBookingClick: (booking: BookingWithTreatments) => void;
  /**
   * Clicking a free hour inside a shift — creates a booking for that therapist.
   * `hotelId` n'est fourni que si le thérapeute n'est rattaché qu'à un lieu visible.
   */
  onSlotClick: (date: Date, time: string, therapistId: string, hotelId?: string) => void;
  showOnlyScheduled: boolean;
  onShowOnlyScheduledChange: (value: boolean) => void;
  /** Treatments of the venue, for the "who can take this?" search. Vide en multi-lieux. */
  treatments: VenueTreatmentMenu[];
  selectedTreatmentId: string;
  onSelectedTreatmentChange: (treatmentId: string) => void;
}

function minutesToLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** Ranges of [dayStart, dayEnd) not covered by any open range. */
function closedRanges(open: TimeRange[], dayStart: number, dayEnd: number): TimeRange[] {
  if (open.length === 0) return [{ startMin: dayStart, endMin: dayEnd }];
  const sorted = [...open].sort((a, b) => a.startMin - b.startMin);
  const closed: TimeRange[] = [];
  let cursor = dayStart;
  for (const range of sorted) {
    if (range.startMin > cursor) closed.push({ startMin: cursor, endMin: range.startMin });
    cursor = Math.max(cursor, range.endMin);
  }
  if (cursor < dayEnd) closed.push({ startMin: cursor, endMin: dayEnd });
  return closed;
}

const CLOSED_PATTERN =
  "repeating-linear-gradient(-45deg, transparent, transparent 5px, rgba(120, 120, 120, 0.10) 5px, rgba(120, 120, 120, 0.10) 10px)";

export function TherapistDayView({
  date,
  planning,
  hours,
  hourHeight,
  startHour,
  endHour,
  onPreviousDay,
  onNextDay,
  onGoToToday,
  onSetDate,
  getBookingPosition,
  getBookingsLayoutForDay,
  getCurrentTimePosition,
  getCalendarCardColor,
  getStatusColor,
  getTranslatedStatus,
  getHotelInfo,
  onBookingClick,
  onSlotClick,
  showOnlyScheduled,
  onShowOnlyScheduledChange,
  treatments,
  selectedTreatmentId,
  onSelectedTreatmentChange,
}: TherapistDayViewProps) {
  const { t, i18n } = useTranslation("admin");
  const navigate = useNavigate();
  const isFr = i18n.language?.startsWith("fr");
  const locale = isFr ? fr : enUS;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    columns,
    unassignedBookings,
    blockedRanges,
    roomBlockedRanges,
    availabilityByHour,
    qualifiedTherapistCount,
    hiddenColumnCount,
    isMultiVenue,
  } = planning;

  const dayStart = startHour * 60;
  const dayEnd = endHour * 60;
  const minutesToTop = (min: number) => ((min - dayStart) / 60) * hourHeight;

  const searchedTreatment = treatments.find((tm) => tm.id === selectedTreatmentId) ?? null;
  const treatmentLabel = (tm: VenueTreatmentMenu) => {
    const name = (isFr ? tm.name : tm.name_en || tm.name) || tm.name;
    return tm.duration ? `${name} · ${tm.duration} min` : name;
  };

  const treatmentOptions = useMemo(
    () => [
      { value: ALL_TREATMENTS, label: t("planning.allTreatments") },
      ...treatments.map((tm) => ({ value: tm.id, label: treatmentLabel(tm) })),
    ],
    // treatmentLabel closes over the language only, which changes with i18n.language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [treatments, t, isFr],
  );

  // Hours at which the searched treatment could actually start. `allOverflow` when
  // every available therapist would run past their shift — still bookable, but the
  // manager should know before offering it.
  const openSlots = useMemo(
    () =>
      hours
        .map((hour) => ({ hour, free: availabilityByHour.get(hour)?.free ?? [] }))
        .filter(({ free }) => free.length > 0)
        .map(({ hour, free }) => ({
          hour,
          allOverflow: free.every((f) => f.overflowsShift),
        })),
    [hours, availabilityByHour],
  );

  // Auto-scroll to current time on mount, like the calendar view.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const currentHour = new Date().getHours();
    if (currentHour >= startHour && currentHour < endHour) {
      container.scrollTop = Math.max(0, (currentHour - startHour - 1) * hourHeight);
    }
  }, [startHour, endHour, hourHeight]);

  const showUnassigned = unassignedBookings.length > 0;
  const columnCount = columns.length + (showUnassigned ? 1 : 0);
  const gridTemplateColumns = `64px repeat(${columnCount}, minmax(150px, 1fr))`;

  const unassignedLayout = useMemo(
    () => getBookingsLayoutForDay(unassignedBookings),
    [getBookingsLayoutForDay, unassignedBookings],
  );

  const { showIndicator, position: currentTimeTop } = getCurrentTimePosition(date);

  return (
    <div className="p-2 md:p-3 flex flex-col h-full overflow-hidden">
      {/* Navigation + treatment search */}
      <div className="flex items-center justify-between mb-1 gap-2 flex-shrink-0 flex-wrap">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs font-medium"
            onClick={onGoToToday}
          >
            {t("planning.today")}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPreviousDay}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <button className="text-sm hover:bg-muted px-2 py-1 rounded-md transition-colors cursor-pointer capitalize">
                {format(date, "EEEE d MMMM yyyy", { locale })}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(next) => {
                  if (next) onSetDate(next);
                }}
                locale={locale}
                weekStartsOn={1}
              />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNextDay}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Les menus de soins sont par lieu : la recherche n'a de sens qu'en mono-lieu. */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn(isMultiVenue && "cursor-not-allowed")}>
                  <SelectField
                    options={treatmentOptions}
                    value={selectedTreatmentId}
                    onChange={onSelectedTreatmentChange}
                    placeholder={t("planning.allTreatments")}
                    searchPlaceholder={t("planning.searchTreatment")}
                    className="h-7 w-[230px] text-xs"
                    aria-label={t("planning.searchTreatment")}
                    disabled={isMultiVenue}
                  />
                </span>
              </TooltipTrigger>
              {isMultiVenue && (
                <TooltipContent side="bottom">
                  <span className="text-xs">{t("planning.treatmentSearchNeedsVenue")}</span>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs font-normal"
            onClick={() => onShowOnlyScheduledChange(!showOnlyScheduled)}
          >
            <Users className="h-3.5 w-3.5 mr-1" />
            {showOnlyScheduled ? t("planning.scheduledTeam") : t("planning.allTeam")}
            {showOnlyScheduled && hiddenColumnCount > 0 && (
              <span className="ml-1 text-muted-foreground">+{hiddenColumnCount}</span>
            )}
          </Button>
        </div>
      </div>

      {/* Answer bar: how many can take this treatment, and when */}
      {searchedTreatment && (
        <div className="flex items-start gap-2 mb-1 px-2 py-1.5 rounded-md border border-border bg-muted/40 flex-shrink-0 text-xs flex-wrap">
          <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
          <span className="font-medium text-foreground">
            {treatmentLabel(searchedTreatment)}
          </span>
          <span className="text-muted-foreground">
            {t("planning.qualifiedTherapists", { n: qualifiedTherapistCount })}
          </span>
          {openSlots.length > 0 ? (
            <span className="text-muted-foreground">
              · {t("planning.availableSlots")} :{" "}
              <TooltipProvider>
                {openSlots.map(({ hour, allOverflow }, index) => (
                  <span key={hour} className="text-foreground font-medium">
                    {index > 0 && <span className="text-muted-foreground">, </span>}
                    {hour.toString().padStart(2, "0")}:00
                    {allOverflow && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <sup className="cursor-default">
                            <AlertTriangle className="inline h-3 w-3 text-amber-500 dark:text-amber-400" />
                          </sup>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <span className="text-xs">{t("planning.slotOverflowsShift")}</span>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </span>
                ))}
              </TooltipProvider>
            </span>
          ) : (
            <span className="text-red-600 dark:text-red-400 font-medium">
              · {t("planning.noSlotForTreatment")}
            </span>
          )}
        </div>
      )}

      {/* Grid */}
      <div className="w-full flex-1 flex flex-col min-h-0">
        <div className="w-full bg-card rounded-lg border border-border flex flex-col h-full overflow-hidden">
          {planning.isLoading ? (
            <AppLoader fullScreen={false} className="flex-1" />
          ) : columnCount === 0 ? (
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <div className="text-sm text-muted-foreground">
                {isMultiVenue
                  ? t("planning.noTherapistsForVenues")
                  : t("planning.noTherapistsForDay")}
              </div>
            </div>
          ) : (
            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-auto"
              style={{ scrollbarGutter: "stable" }}
            >
              {/* Column headers */}
              <div
                className="sticky top-0 z-20 border-b border-border bg-card grid"
                style={{ gridTemplateColumns }}
              >
                <div className="sticky left-0 z-10 px-2 py-1.5 border-r border-border bg-muted flex items-end">
                  <span className="text-[10px] md:text-xs font-medium text-muted-foreground">
                    {t("planning.hourColumn")}
                  </span>
                </div>

                {showUnassigned && (
                  <div className="px-2 py-1.5 border-r border-border bg-amber-50 dark:bg-amber-950/20 flex flex-col items-center justify-end gap-0.5">
                    <UserX className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-400 text-center leading-tight">
                      {t("planning.unassigned")}
                    </span>
                    <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80">
                      {unassignedBookings.length}
                    </span>
                  </div>
                )}

                {columns.map((col) => (
                  <TherapistColumnHeader
                    key={col.therapist.id}
                    column={col}
                    hasTreatmentSearch={!!searchedTreatment}
                    showVenues={isMultiVenue}
                    getHotelInfo={getHotelInfo}
                  />
                ))}
              </div>

              {/* Body */}
              <div className="grid" style={{ gridTemplateColumns }}>
                {/* Hours + how many therapists are available */}
                <div className="sticky left-0 z-10 border-r border-border bg-muted/95 backdrop-blur-sm">
                  <TooltipProvider>
                    {hours.map((hour) => {
                      const availability = availabilityByHour.get(hour);
                      const free = availability?.free ?? [];
                      return (
                        <div
                          key={hour}
                          className="border-b border-border px-1 py-0.5 flex flex-col items-center gap-0.5"
                          style={{ height: `${hourHeight}px` }}
                        >
                          <span className="text-xs font-semibold text-muted-foreground">
                            {hour.toString().padStart(2, "0")}:00
                          </span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={cn(
                                  "text-[10px] font-semibold px-1.5 rounded-full leading-4 cursor-default",
                                  free.length === 0 &&
                                    "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
                                  free.length === 1 &&
                                    "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
                                  free.length >= 2 &&
                                    "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
                                )}
                              >
                                {free.length}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                              <HourTooltip
                                hour={hour}
                                free={free}
                                isBlocked={!!availability?.isBlocked}
                                hasTreatmentSearch={!!searchedTreatment}
                              />
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      );
                    })}
                  </TooltipProvider>
                </div>

                {/* Unassigned bookings — read-only column */}
                {showUnassigned && (
                  <div className="relative border-r border-border bg-amber-50/40 dark:bg-amber-950/10">
                    {hours.map((hour) => (
                      <div
                        key={hour}
                        className="border-b border-border"
                        style={{ height: `${hourHeight}px` }}
                      />
                    ))}
                    <TooltipProvider>
                      {unassignedBookings.map((booking) => (
                        <BookingCard
                          key={booking.id}
                          booking={booking}
                          layoutInfo={unassignedLayout.get(booking.id)}
                          band={0}
                          bandCount={1}
                          getBookingPosition={getBookingPosition}
                          getCalendarCardColor={getCalendarCardColor}
                          getStatusColor={getStatusColor}
                          getTranslatedStatus={getTranslatedStatus}
                          getHotelInfo={getHotelInfo}
                          onBookingClick={onBookingClick}
                          navigate={navigate}
                          showCleanupBuffer={false}
                        />
                      ))}
                    </TooltipProvider>
                    {showIndicator && <CurrentTimeLine top={currentTimeTop} />}
                  </div>
                )}

                {/* One column per therapist */}
                {columns.map((col) => (
                  <TherapistColumn
                    key={col.therapist.id}
                    column={col}
                    date={date}
                    hours={hours}
                    hourHeight={hourHeight}
                    dayStart={dayStart}
                    dayEnd={dayEnd}
                    minutesToTop={minutesToTop}
                    blockedRanges={blockedRanges}
                    roomBlockedRanges={roomBlockedRanges}
                    showVenueOnBlocks={isMultiVenue}
                    getBookingPosition={getBookingPosition}
                    getBookingsLayoutForDay={getBookingsLayoutForDay}
                    getCalendarCardColor={getCalendarCardColor}
                    getStatusColor={getStatusColor}
                    getTranslatedStatus={getTranslatedStatus}
                    getHotelInfo={getHotelInfo}
                    onBookingClick={onBookingClick}
                    onSlotClick={onSlotClick}
                    showIndicator={showIndicator}
                    currentTimeTop={currentTimeTop}
                    navigate={navigate}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HourTooltip({
  hour,
  free,
  isBlocked,
  hasTreatmentSearch,
}: {
  hour: number;
  free: FreeTherapist[];
  isBlocked: boolean;
  hasTreatmentSearch: boolean;
}) {
  const { t } = useTranslation("admin");
  const hourLabel = hour.toString().padStart(2, "0");

  if (isBlocked) {
    return <span className="text-xs">{t("planning.blockedSlot")}</span>;
  }

  return (
    <div className="text-xs max-w-[220px]">
      <div className="font-medium">
        {hasTreatmentSearch
          ? t("planning.canTakeAtHour", { hour: hourLabel })
          : t("planning.freeAtHour", { hour: hourLabel })}
      </div>
      {free.length === 0 ? (
        <div className="text-muted-foreground mt-0.5">{t("planning.noneAvailable")}</div>
      ) : (
        <ul className="text-muted-foreground mt-0.5 space-y-0.5">
          {free.map(({ therapist, overflowsShift }) => (
            <li key={therapist.id}>
              {shortName(therapist.first_name, therapist.last_name)}
              {overflowsShift && (
                <span className="text-amber-600 dark:text-amber-400">
                  {" "}
                  · {t("planning.overflowsShift")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CurrentTimeLine({ top }: { top: number }) {
  return (
    <div
      className="absolute left-0 right-0 h-0.5 bg-destructive z-20 pointer-events-none"
      style={{ top: `${top}px` }}
    >
      <div className="absolute -left-1.5 -top-1 w-2.5 h-2.5 bg-destructive rounded-full" />
    </div>
  );
}

function TherapistColumnHeader({
  column,
  hasTreatmentSearch,
  showVenues,
  getHotelInfo,
}: {
  column: TherapistDayColumn;
  hasTreatmentSearch: boolean;
  /** Multi-lieux : on nomme les spas sous le thérapeute, sinon c'est du bruit. */
  showVenues: boolean;
  getHotelInfo: TherapistDayViewProps["getHotelInfo"];
}) {
  const { t } = useTranslation("admin");
  const { therapist, venueIds, openRanges, isAbsent, hasNoSchedule, isQualified } = column;
  const dimmed = hasTreatmentSearch && !isQualified;

  const venueLabel = showVenues
    ? venueIds
        .map((id) => getHotelInfo(id)?.name)
        .filter(Boolean)
        .join(" · ")
    : "";

  const shiftLabel = openRanges
    .map((r) => `${minutesToLabel(r.startMin)}–${minutesToLabel(r.endMin)}`)
    .join(", ");

  return (
    <div
      className={cn(
        "px-2 py-1.5 border-r border-border last:border-r-0 bg-muted flex flex-col items-center gap-0.5",
        dimmed && "opacity-50",
      )}
    >
      <Avatar className="h-7 w-7">
        {therapist.profile_image && <AvatarImage src={therapist.profile_image} alt="" />}
        <AvatarFallback className="text-[10px]">
          {initials(therapist.first_name, therapist.last_name)}
        </AvatarFallback>
      </Avatar>
      <span className="text-xs font-medium text-foreground text-center leading-tight">
        {shortName(therapist.first_name, therapist.last_name)}
      </span>
      {venueLabel && (
        <span className="text-[10px] text-muted-foreground text-center leading-tight truncate max-w-full">
          {venueLabel}
        </span>
      )}
      {dimmed ? (
        <span className="text-[10px] font-medium px-1.5 rounded-full bg-muted-foreground/15 text-muted-foreground text-center leading-tight">
          {t("planning.notQualified")}
        </span>
      ) : isAbsent ? (
        <span className="text-[10px] font-medium px-1.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 inline-flex items-center gap-0.5">
          <UserX className="h-2.5 w-2.5" />
          {t("planning.absent")}
        </span>
      ) : hasNoSchedule ? (
        <span className="text-[10px] font-medium px-1.5 rounded-full bg-muted-foreground/15 text-muted-foreground inline-flex items-center gap-0.5">
          <CalendarOff className="h-2.5 w-2.5" />
          {t("planning.noSchedule")}
        </span>
      ) : (
        <span className="text-[10px] text-muted-foreground">{shiftLabel}</span>
      )}
    </div>
  );
}

interface TherapistColumnProps {
  column: TherapistDayColumn;
  date: Date;
  hours: number[];
  hourHeight: number;
  dayStart: number;
  dayEnd: number;
  minutesToTop: (min: number) => number;
  blockedRanges: TherapistDayPlanning["blockedRanges"];
  roomBlockedRanges: TherapistDayPlanning["roomBlockedRanges"];
  /** Multi-lieux : chaque bande porte le nom de son spa. */
  showVenueOnBlocks: boolean;
  getBookingPosition: TherapistDayViewProps["getBookingPosition"];
  getBookingsLayoutForDay: TherapistDayViewProps["getBookingsLayoutForDay"];
  getCalendarCardColor: TherapistDayViewProps["getCalendarCardColor"];
  getStatusColor: TherapistDayViewProps["getStatusColor"];
  getTranslatedStatus: TherapistDayViewProps["getTranslatedStatus"];
  getHotelInfo: TherapistDayViewProps["getHotelInfo"];
  onBookingClick: TherapistDayViewProps["onBookingClick"];
  onSlotClick: TherapistDayViewProps["onSlotClick"];
  showIndicator: boolean;
  currentTimeTop: number;
  navigate: ReturnType<typeof useNavigate>;
}

function TherapistColumn({
  column,
  date,
  hours,
  hourHeight,
  dayStart,
  dayEnd,
  minutesToTop,
  blockedRanges,
  roomBlockedRanges,
  showVenueOnBlocks,
  getBookingPosition,
  getBookingsLayoutForDay,
  getCalendarCardColor,
  getStatusColor,
  getTranslatedStatus,
  getHotelInfo,
  onBookingClick,
  onSlotClick,
  showIndicator,
  currentTimeTop,
  navigate,
}: TherapistColumnProps) {
  const { t } = useTranslation("admin");
  const { therapist, venueIds, openRanges, bookings } = column;

  const layout = useMemo(() => getBookingsLayoutForDay(bookings), [getBookingsLayoutForDay, bookings]);
  const closed = useMemo(
    () => closedRanges(openRanges, dayStart, dayEnd),
    [openRanges, dayStart, dayEnd],
  );

  // Une fermeture ne concerne que les thérapeutes du lieu bloqué.
  const ownBlockedRanges = useMemo(
    () => blockedRanges.filter((b) => venueIds.includes(b.hotelId)),
    [blockedRanges, venueIds],
  );
  const ownRoomBlockedRanges = useMemo(
    () => roomBlockedRanges.filter((b) => venueIds.includes(b.hotelId)),
    [roomBlockedRanges, venueIds],
  );

  // Un thérapeute rattaché à plusieurs lieux ne peut pas voir son lieu déduit :
  // le dialog de création le fera choisir.
  const slotHotelId = venueIds.length === 1 ? venueIds[0] : undefined;

  const isHourBookable = (hour: number) => {
    const hourStart = hour * 60;
    const hourEnd = hourStart + 60;
    if (!openRanges.some((r) => hourStart < r.endMin && hourEnd > r.startMin)) return false;
    // Bookable dès qu'un de ses lieux reste ouvert.
    return venueIds.some(
      (id) =>
        !ownBlockedRanges.some(
          (b) => b.hotelId === id && hourStart < b.endMin && hourEnd > b.startMin,
        ),
    );
  };

  return (
    <div className="relative border-r border-border last:border-r-0">
      {/* Hour cells */}
      {hours.map((hour) => {
        const bookable = isHourBookable(hour);
        return (
          <div
            key={hour}
            className={cn(
              "border-b border-border transition-colors",
              bookable
                ? cn(hour % 2 !== 0 ? "bg-muted/10" : "", "cursor-pointer hover:bg-primary/10")
                : "cursor-default",
            )}
            style={{ height: `${hourHeight}px` }}
            onClick={
              bookable
                ? () =>
                    onSlotClick(
                      date,
                      `${hour.toString().padStart(2, "0")}:00`,
                      therapist.id,
                      slotHotelId,
                    )
                : undefined
            }
          />
        );
      })}

      {/* Outside the declared shift */}
      {closed.map((range) => (
        <div
          key={`closed-${range.startMin}`}
          className="absolute left-0 right-0 bg-muted/40 pointer-events-none"
          style={{
            top: `${minutesToTop(range.startMin)}px`,
            height: `${((range.endMin - range.startMin) / 60) * hourHeight}px`,
            backgroundImage: CLOSED_PATTERN,
          }}
        />
      ))}

      {/* Venue-wide blocked slots (lunch break, maintenance…) */}
      {ownBlockedRanges.map((range) => (
        <div
          key={`blocked-${range.id}`}
          className="absolute left-0.5 right-0.5 rounded-sm bg-red-500/20 border border-red-500/45 px-1 py-0.5 pointer-events-none overflow-hidden"
          style={{
            top: `${minutesToTop(range.startMin)}px`,
            height: `${((range.endMin - range.startMin) / 60) * hourHeight}px`,
          }}
        >
          <span className="text-[10px] font-medium text-red-800 dark:text-red-300 leading-tight">
            {range.label || t("planning.blockedSlot")}
            {showVenueOnBlocks && getHotelInfo(range.hotelId)?.name
              ? ` · ${getHotelInfo(range.hotelId)?.name}`
              : ""}
          </span>
        </div>
      ))}

      {/* Blocages datés ciblant une salle : la colonne reste réservable via les
          autres salles, on informe seulement. */}
      {ownRoomBlockedRanges.map((range) => (
        <div
          key={`room-blocked-${range.id}`}
          className="absolute left-0.5 right-0.5 rounded-sm bg-amber-500/15 border border-amber-500/40 px-1 py-0.5 pointer-events-none overflow-hidden"
          style={{
            top: `${minutesToTop(range.startMin)}px`,
            height: `${((range.endMin - range.startMin) / 60) * hourHeight}px`,
          }}
        >
          <span className="text-[10px] font-medium text-amber-800 dark:text-amber-300 leading-tight">
            {range.label || t("planning.roomBlock")}
            {range.roomName ? ` · ${range.roomName}` : ""}
            {showVenueOnBlocks && getHotelInfo(range.hotelId)?.name
              ? ` · ${getHotelInfo(range.hotelId)?.name}`
              : ""}
          </span>
        </div>
      ))}

      {/* Bookings */}
      <TooltipProvider>
        {bookings.map((booking) => (
          <BookingCard
            key={booking.id}
            booking={booking}
            layoutInfo={layout.get(booking.id)}
            band={0}
            bandCount={1}
            getBookingPosition={getBookingPosition}
            getCalendarCardColor={getCalendarCardColor}
            getStatusColor={getStatusColor}
            getTranslatedStatus={getTranslatedStatus}
            getHotelInfo={getHotelInfo}
            onBookingClick={onBookingClick}
            navigate={navigate}
            showCleanupBuffer={false}
          />
        ))}
      </TooltipProvider>

      {showIndicator && <CurrentTimeLine top={currentTimeTop} />}
    </div>
  );
}
