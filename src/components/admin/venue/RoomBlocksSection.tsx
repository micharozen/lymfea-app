import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { Ban, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { groupRoomBlocks, useDeleteRoomBlock, useRoomBlocks } from "@/hooks/booking";
import { RoomBlockDialog } from "./RoomBlockDialog";

interface RoomBlocksSectionProps {
  hotelId: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const inOneYearIso = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
};

const formatDay = (iso: string) => format(parseISO(iso), "dd/MM/yyyy");

/**
 * Blocages ponctuels datés à venir du lieu, groupés par création
 * (multi-salles / multi-jours) et supprimables en bloc.
 */
export function RoomBlocksSection({ hotelId }: RoomBlocksSectionProps) {
  const { t } = useTranslation(["admin", "common"]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: rows, isLoading } = useRoomBlocks({
    venueId: hotelId,
    from: todayIso(),
    to: inOneYearIso(),
  });
  const deleteBlock = useDeleteRoomBlock();

  const groups = groupRoomBlocks(rows || []);

  return (
    <div className="space-y-3 border-t pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">{t("roomBlocks.sectionTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("roomBlocks.sectionDescription")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t("roomBlocks.add")}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">{t("roomBlocks.loading")}</p>
      ) : groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("roomBlocks.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {groups.map((group) => (
            <li
              key={group.key}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Ban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{group.label}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {group.startDate === group.endDate
                    ? formatDay(group.startDate)
                    : `${formatDay(group.startDate)} → ${formatDay(group.endDate)}`}
                  {" · "}
                  {group.startTime}–{group.endTime}
                  {" · "}
                  {group.isWholeVenue ? t("roomBlocks.wholeVenue") : group.roomNames.join(", ")}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={deleteBlock.isPending}
                onClick={() => {
                  if (window.confirm(t("roomBlocks.confirmDelete", { label: group.label }))) {
                    deleteBlock.mutate(group);
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <RoomBlockDialog open={dialogOpen} onOpenChange={setDialogOpen} hotelId={hotelId} />
    </div>
  );
}
