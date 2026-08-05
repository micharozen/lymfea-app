import { useMemo, useState } from "react";
import { addWeeks, format, startOfWeek } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, ChevronRight as ChevronCollapsed, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SelectField } from "@/components/ui/select-field";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AppLoader } from "@/components/AppLoader";
import { cn } from "@/lib/utils";
import { useTreatmentCoverage } from "@/hooks/booking/useTreatmentCoverage";
import type { TreatmentCoverageRow } from "@/hooks/booking/useTreatmentCoverage";
import type { Hotel } from "@/hooks/booking";
import { initials, shortName } from "./therapistDisplay";

const ALL_VENUES = "__all__";
const DAY_COUNT = 7;

interface TreatmentCoverageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lieux visibles par l'utilisateur — déjà chargés par la page. */
  hotels: Hotel[];
}

/**
 * Lecture inverse du planning : une ligne par prestation, une colonne par jour,
 * chaque cellule au format X/Y (disponibles / qualifiés).
 *
 * Sert à repérer d'un coup d'œil les erreurs d'attribution — une prestation
 * réservable un jour où personne ne peut la réaliser. Lecture seule : la
 * correction se fait sur la fiche du thérapeute.
 */
export function TreatmentCoverageDialog({
  open,
  onOpenChange,
  hotels,
}: TreatmentCoverageDialogProps) {
  const { t, i18n } = useTranslation("admin");
  const navigate = useNavigate();
  const locale = i18n.language.startsWith("fr") ? fr : enUS;

  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const [search, setSearch] = useState("");
  const [venueFilter, setVenueFilter] = useState(ALL_VENUES);
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const venues = useMemo(
    () => hotels.map((h) => ({ id: h.id, name: h.name })),
    [hotels],
  );

  const { rows, days, totalGaps, isLoading } = useTreatmentCoverage({
    venues,
    startDate: weekStart,
    dayCount: DAY_COUNT,
    // Ne rien charger tant que la modale n'a pas été ouverte.
    enabled: open,
  });

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (venueFilter !== ALL_VENUES && row.venueId !== venueFilter) return false;
      if (onlyGaps && row.gapCount === 0) return false;
      if (!needle) return true;
      return (
        row.treatment.name.toLowerCase().includes(needle) ||
        (row.treatment.name_en ?? "").toLowerCase().includes(needle) ||
        row.venueName.toLowerCase().includes(needle)
      );
    });
  }, [rows, search, venueFilter, onlyGaps]);

  const venueOptions = useMemo(
    () => [
      { value: ALL_VENUES, label: t("planning.coverage.allVenues") },
      ...venues.map((v) => ({ value: v.id, label: v.name })),
    ],
    [venues, t],
  );

  const rangeLabel = `${format(days[0], "d MMM", { locale })} → ${format(
    days[days.length - 1],
    "d MMM yyyy",
    { locale },
  )}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 space-y-3">
          {/* pr-8 : le bouton de fermeture du Dialog est en absolute right-4, il
              recouvrirait la plage de dates alignée à droite. */}
          <div className="flex items-baseline justify-between gap-4 flex-wrap pr-8">
            <DialogTitle className="font-normal">
              {t("planning.coverage.title")}
            </DialogTitle>
            <span className="text-sm text-muted-foreground">{rangeLabel}</span>
          </div>
          <DialogDescription className="sr-only">
            {t("planning.coverage.description")}
          </DialogDescription>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("planning.coverage.searchPlaceholder")}
                className="h-8 pl-8 text-xs"
              />
            </div>
            <SelectField
              options={venueOptions}
              value={venueFilter}
              onChange={setVenueFilter}
              className="h-8 w-full sm:w-56 text-xs"
              aria-label={t("planning.coverage.venue")}
            />
            <div className="flex items-center gap-1 ml-auto">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setWeekStart((d) => addWeeks(d, -1))}
                aria-label={t("planning.coverage.previousWeek")}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
              >
                {t("planning.coverage.thisWeek")}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setWeekStart((d) => addWeeks(d, 1))}
                aria-label={t("planning.coverage.nextWeek")}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p
              className={cn(
                "text-xs flex items-center gap-1.5",
                totalGaps > 0 ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {totalGaps > 0 && <AlertTriangle className="h-3.5 w-3.5" />}
              {totalGaps > 0
                ? t("planning.coverage.gapSummary", { count: totalGaps })
                : t("planning.coverage.noGap")}
            </p>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Checkbox
                checked={onlyGaps}
                onCheckedChange={(v) => setOnlyGaps(v === true)}
              />
              {t("planning.coverage.onlyGaps")}
            </label>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto border-t border-border">
          {isLoading ? (
            <AppLoader fullScreen={false} className="h-full" />
          ) : visibleRows.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {t("planning.coverage.empty")}
            </p>
          ) : (
            <TooltipProvider delayDuration={200}>
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-20 bg-card">
                  <tr className="border-b border-border">
                    <th className="sticky left-0 z-30 bg-card text-left font-medium px-4 py-2 min-w-[280px]">
                      {t("planning.coverage.treatment")}
                    </th>
                    <th className="text-left font-medium px-3 py-2 min-w-[140px]">
                      {t("planning.coverage.venue")}
                    </th>
                    {days.map((day) => (
                      <th
                        key={day.toISOString()}
                        className="font-medium px-2 py-2 text-center min-w-[68px] capitalize"
                      >
                        {format(day, "EEE d", { locale })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <CoverageRow
                      key={row.treatment.id}
                      row={row}
                      isExpanded={expanded === row.treatment.id}
                      onToggle={() =>
                        setExpanded((id) =>
                          id === row.treatment.id ? null : row.treatment.id,
                        )
                      }
                      onTherapistClick={(id) => {
                        onOpenChange(false);
                        navigate(`/admin/therapists/${id}`);
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </TooltipProvider>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface CoverageRowProps {
  row: TreatmentCoverageRow;
  isExpanded: boolean;
  onToggle: () => void;
  onTherapistClick: (therapistId: string) => void;
}

function CoverageRow({ row, isExpanded, onToggle, onTherapistClick }: CoverageRowProps) {
  const { t } = useTranslation("admin");
  const total = row.qualifiedTherapists.length;

  return (
    <>
      <tr
        className="border-b border-border hover:bg-muted/40 cursor-pointer"
        onClick={onToggle}
      >
        <td className="sticky left-0 z-10 bg-card px-4 py-2">
          <div className="flex items-center gap-1.5">
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronCollapsed className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <span className="font-medium">{row.treatment.name}</span>
            {row.treatment.duration ? (
              <span className="text-muted-foreground">{row.treatment.duration}'</span>
            ) : null}
          </div>
        </td>
        <td className="px-3 py-2 text-muted-foreground">{row.venueName}</td>
        {row.cells.map((cell) => {
          const count = cell.availableTherapists.length;
          if (!cell.offered) {
            return (
              <td
                key={cell.date}
                className="px-2 py-2 text-center text-muted-foreground/50"
                title={t("planning.coverage.notOffered")}
              >
                –
              </td>
            );
          }
          return (
            <td key={cell.date} className="px-2 py-2 text-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "inline-block min-w-[38px] rounded px-1.5 py-0.5 tabular-nums",
                      count === 0
                        ? "bg-destructive/15 text-destructive font-medium"
                        : "text-foreground",
                    )}
                  >
                    {count}/{total}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {count === 0
                    ? total === 0
                      ? t("planning.coverage.noTherapistLinked")
                      : t("planning.coverage.noneAvailable")
                    : cell.availableTherapists
                        .map((th) => shortName(th.first_name, th.last_name))
                        .join(", ")}
                </TooltipContent>
              </Tooltip>
            </td>
          );
        })}
      </tr>

      {/* Détail nominatif : des <tr> de la même table, pour que les colonnes
          jour restent alignées avec la ligne récapitulative au-dessus. */}
      {isExpanded && total === 0 && (
        <tr className="border-b border-border bg-muted/20">
          <td
            colSpan={2 + row.cells.length}
            className="px-4 py-3 text-destructive"
          >
            {t("planning.coverage.noTherapistLinked")}
          </td>
        </tr>
      )}

      {isExpanded &&
        row.qualifiedTherapists.map((therapist) => (
          <tr key={therapist.id} className="border-b border-border bg-muted/20">
            <td className="sticky left-0 z-10 bg-muted/20 px-4 py-1.5">
              <button
                type="button"
                className="flex items-center gap-2 pl-5 hover:underline"
                onClick={() => onTherapistClick(therapist.id)}
              >
                <Avatar className="h-5 w-5">
                  <AvatarImage src={therapist.profile_image ?? undefined} />
                  <AvatarFallback className="text-[9px]">
                    {initials(therapist.first_name, therapist.last_name)}
                  </AvatarFallback>
                </Avatar>
                {shortName(therapist.first_name, therapist.last_name)}
              </button>
            </td>
            <td />
            {row.cells.map((cell) => {
              const status = row.statusByTherapist.get(therapist.id)?.get(cell.date);
              return (
                <td
                  key={cell.date}
                  className={cn(
                    "px-2 py-1.5 text-center text-[10px] leading-tight",
                    status?.present ? "text-foreground" : "text-muted-foreground/60",
                  )}
                >
                  {status?.present
                    ? (status.shiftLabel ?? t("planning.coverage.allDay"))
                    : status?.reason === "absent"
                      ? t("planning.coverage.absent")
                      : t("planning.coverage.notScheduled")}
                </td>
              );
            })}
          </tr>
        ))}
    </>
  );
}
