import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { calendarFlowStages, calendarFlowStageOrder } from "@/utils/statusStyles";
import type { Hotel } from "@/hooks/booking";

interface CalendarLegendProps {
  hotels?: Hotel[];
  /** Selected venue ids; empty means no venue filter. */
  hotelFilter?: string[];
  /** Whether cancelled bookings are currently shown on the calendar. */
  showCancelled?: boolean;
  /** Toggle cancelled visibility (only meaningful when a venue is filtered). */
  onToggleCancelled?: () => void;
  className?: string;
}

export function CalendarLegend({
  hotels,
  hotelFilter,
  showCancelled,
  onToggleCancelled,
  className,
}: CalendarLegendProps) {
  const { t, i18n } = useTranslation("admin");
  const fr = i18n.language?.startsWith("fr");
  const hasVenueFilter = !!hotelFilter?.length;
  // Built from the same flow stages used to color the cards, so the legend
  // always matches what's shown on the planning. With no venue filtered,
  // cancelled and no-show are never drawn — drop them from the legend too.
  const statusEntries = calendarFlowStageOrder
    .filter((key) => hasVenueFilter || (key !== "cancelled" && key !== "noshow"))
    .map((key) => {
      const stage = calendarFlowStages[key];
      return { key, label: fr ? stage.label : stage.labelEn, swatchClass: stage.swatchClass };
    });

  const visibleHotels = hasVenueFilter
    ? hotels?.filter((h) => hotelFilter!.includes(h.id)) ?? []
    : hotels ?? [];

  return (
    <div className={cn("flex flex-col gap-3 px-3 py-3 text-xs", className)}>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          {t("calendar.statuses", "Statuts")}
        </div>
        <ul className="space-y-1">
          {statusEntries.map((s) => {
            // The cancelled item doubles as a show/hide toggle when a venue is
            // filtered; dimmed + struck through when cancelled are hidden.
            const isCancelledToggle =
              s.key === "cancelled" && hasVenueFilter && !!onToggleCancelled;
            const hidden = isCancelledToggle && !showCancelled;

            const content = (
              <>
                <span
                  className={cn(
                    "inline-block h-3 w-3 rounded-sm flex-shrink-0",
                    s.swatchClass
                  )}
                />
                <span className={cn("truncate", hidden && "line-through")}>
                  {s.label}
                </span>
              </>
            );

            if (isCancelledToggle) {
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={onToggleCancelled}
                    title={t(
                      "calendar.toggleCancelled",
                      "Cliquer pour afficher/masquer les annulés"
                    )}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm text-left hover:bg-foreground/5 transition-colors",
                      hidden && "opacity-40"
                    )}
                  >
                    {content}
                  </button>
                </li>
              );
            }

            return (
              <li key={s.key} className="flex items-center gap-2">
                {content}
              </li>
            );
          })}
        </ul>
      </div>

      {visibleHotels.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            {t("calendar.venues", "Lieux")}
          </div>
          <ul className="space-y-1">
            {visibleHotels.map((hotel) => (
              <li key={hotel.id} className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-1 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: hotel.calendar_color || "#3b82f6" }}
                />
                <span className="truncate">{hotel.name}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] text-muted-foreground italic">
            {t("calendar.verticalBarHint", "Barre verticale sur la carte")}
          </p>
        </div>
      )}
    </div>
  );
}
