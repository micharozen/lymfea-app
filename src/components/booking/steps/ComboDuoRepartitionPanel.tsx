import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { GripVertical, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComboDuoRepartitionPanelProps {
  /** Labels of the base soins, indexed like `legAssignments`. */
  baseSoinLabels: string[];
  /** Duration (min) of each base soin, indexed like `legAssignments`. */
  baseSoinDurations: number[];
  /** Base soin i → practitioner index (0..N-1). */
  legAssignments: number[];
  practitionerCount: number;
  onLegAssignmentsChange: (assignments: number[]) => void;
}

/** Visual of a soin card, shared by the in-column chip and the drag overlay. */
function SoinCardVisual({ label, duration, dragging }: { label: string; duration: number; dragging?: boolean }) {
  return (
    <div
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-violet-950/40 px-2.5 py-2 text-left transition-shadow",
        dragging ? "shadow-lg ring-2 ring-violet-300 rotate-2 cursor-grabbing" : "shadow-sm",
      )}
    >
      <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{label}</span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-2.5 w-2.5" />
          {duration} min
        </span>
      </span>
    </div>
  );
}

interface SoinChipProps {
  soinIndex: number;
  label: string;
  duration: number;
  onCycle: () => void;
}

/** A draggable soin chip. Click (without dragging) cycles it to the next practitioner. */
function SoinChip({ soinIndex, label, duration, onCycle }: SoinChipProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `soin-${soinIndex}` });
  return (
    <button
      type="button"
      ref={setNodeRef}
      onClick={onCycle}
      {...listeners}
      {...attributes}
      className={cn("block w-full cursor-grab active:cursor-grabbing hover:opacity-90", isDragging && "opacity-30")}
    >
      <SoinCardVisual label={label} duration={duration} />
    </button>
  );
}

interface PractitionerColumnProps {
  legIndex: number;
  title: string;
  totalDuration: number;
  children: React.ReactNode;
  emptyLabel: string;
  totalLabel: string;
}

function PractitionerColumn({ legIndex, title, totalDuration, children, emptyLabel, totalLabel }: PractitionerColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `leg-${legIndex}` });
  const isEmpty = Array.isArray(children) ? children.length === 0 : !children;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-0 flex-1 flex-col rounded-xl border bg-muted/30 p-2.5 transition-colors",
        isOver ? "border-violet-400 bg-violet-50/60 dark:bg-violet-950/30" : "border-border",
      )}
    >
      <div className="mb-2 flex items-center justify-between px-0.5">
        <span className="text-xs font-semibold">{title}</span>
        <span className="text-[10px] text-muted-foreground">
          {totalLabel} {totalDuration} min
        </span>
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto">
        {isEmpty ? (
          <div className="flex h-full min-h-[64px] items-center justify-center rounded-lg border border-dashed border-border text-[11px] text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/**
 * Spacious repartition board shown when there are fewer practitioners than base
 * soins. Each column is a practitioner; each soin is a chip that can be dragged
 * between columns (or clicked to cycle to the next practitioner).
 */
export function ComboDuoRepartitionPanel({
  baseSoinLabels,
  baseSoinDurations,
  legAssignments,
  practitionerCount,
  onLegAssignmentsChange,
}: ComboDuoRepartitionPanelProps) {
  const { t } = useTranslation("admin");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeSoinIndex, setActiveSoinIndex] = useState<number | null>(null);

  const assign = (soinIndex: number, legIndex: number) => {
    if (legAssignments[soinIndex] === legIndex) return;
    const next = [...legAssignments];
    next[soinIndex] = legIndex;
    onLegAssignmentsChange(next);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveSoinIndex(Number(String(event.active.id).replace("soin-", "")));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveSoinIndex(null);
    const soinId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;
    const soinIndex = Number(soinId.replace("soin-", ""));
    const legIndex = Number(overId.replace("leg-", ""));
    if (Number.isNaN(soinIndex) || Number.isNaN(legIndex)) return;
    assign(soinIndex, legIndex);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 shrink-0">
        <p className="text-sm font-semibold">
          {t("booking.comboDuo.repartitionTitle", { defaultValue: "Répartition des soins" })}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {t("booking.comboDuo.repartitionHint", {
            defaultValue: "Glissez un soin vers un praticien (ou cliquez pour le déplacer).",
          })}
        </p>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveSoinIndex(null)}
      >
        <div className="flex min-h-0 flex-1 gap-2.5 overflow-x-auto">
          {Array.from({ length: practitionerCount }, (_, legIndex) => {
            const soinsInLeg = baseSoinLabels
              .map((label, soinIndex) => ({ label, soinIndex }))
              .filter(({ soinIndex }) => (legAssignments[soinIndex] ?? 0) === legIndex);
            const totalDuration = soinsInLeg.reduce((sum, { soinIndex }) => sum + (baseSoinDurations[soinIndex] ?? 0), 0);
            return (
              <PractitionerColumn
                key={legIndex}
                legIndex={legIndex}
                title={t("booking.comboDuo.practitionerOption", { index: legIndex + 1, defaultValue: `Praticien ${legIndex + 1}` })}
                totalDuration={totalDuration}
                emptyLabel={t("booking.comboDuo.dropHere", { defaultValue: "Déposer un soin ici" })}
                totalLabel={t("booking.comboDuo.totalShort", { defaultValue: "Total" })}
              >
                {soinsInLeg.map(({ label, soinIndex }) => (
                  <SoinChip
                    key={soinIndex}
                    soinIndex={soinIndex}
                    label={label}
                    duration={baseSoinDurations[soinIndex] ?? 0}
                    onCycle={() => assign(soinIndex, (legAssignments[soinIndex] + 1) % practitionerCount)}
                  />
                ))}
              </PractitionerColumn>
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeSoinIndex !== null ? (
            <SoinCardVisual
              label={baseSoinLabels[activeSoinIndex] ?? ""}
              duration={baseSoinDurations[activeSoinIndex] ?? 0}
              dragging
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
