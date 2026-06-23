import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { calendarFlowStages, calendarFlowStageOrder } from "@/utils/statusStyles";
import type { Hotel } from "@/hooks/booking";

interface CalendarLegendProps {
  hotels?: Hotel[];
  hotelFilter?: string;
  className?: string;
}

export function CalendarLegend({ hotels, hotelFilter, className }: CalendarLegendProps) {
  const { t, i18n } = useTranslation("admin");
  const fr = i18n.language?.startsWith("fr");
  // Built from the same flow stages used to color the cards, so the legend
  // always matches what's shown on the planning.
  const statusEntries = calendarFlowStageOrder.map((key) => {
    const stage = calendarFlowStages[key];
    return { key, label: fr ? stage.label : stage.labelEn, swatchClass: stage.swatchClass };
  });

  const visibleHotels =
    hotelFilter && hotelFilter !== "all"
      ? hotels?.filter((h) => h.id === hotelFilter) ?? []
      : hotels ?? [];

  return (
    <div className={cn("flex flex-col gap-3 px-3 py-3 text-xs", className)}>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          {t("calendar.statuses", "Statuts")}
        </div>
        <ul className="space-y-1">
          {statusEntries.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-block h-3 w-3 rounded-sm flex-shrink-0",
                  s.swatchClass
                )}
              />
              <span className="truncate">{s.label}</span>
            </li>
          ))}
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
