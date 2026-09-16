import { forwardRef, type CSSProperties, type HTMLAttributes } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "react-i18next";
import { CalendarClock, CalendarCheck2, MessageSquare, MessagesSquare, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { Task, TaskChannel, TaskPriority, TaskStatus } from "@/hooks/tasks/useTasks";
import { PRIORITY_META, STATUS_META, TASK_CHANNEL_META, TASK_TYPE_META } from "./taskConstants";

interface TaskCardProps {
  task: Task;
  assigneeName: string | null;
  assigneeImage: string | null;
  onOpen: (task: Task) => void;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function useTaskCardData(task: Task) {
  const { t } = useTranslation("admin");

  const priority = PRIORITY_META[task.priority as TaskPriority] ?? PRIORITY_META.medium;
  const status = STATUS_META[task.status as TaskStatus] ?? STATUS_META.todo;

  const dueDate = task.due_date
    ? new Date(task.due_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })
    : null;
  const dueDateLong = task.due_date
    ? new Date(task.due_date).toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "2-digit",
        month: "long",
      })
    : null;
  const isOverdue =
    task.due_date != null &&
    task.status !== "done" &&
    new Date(task.due_date).setHours(23, 59, 59, 999) < Date.now();

  const bookingLabel = task.booking != null ? `#${task.booking.booking_id ?? "?"}` : null;

  // Ligne d'identification affichée AVANT le titre : « #123 · Nom · 12/07 ».
  // Le numéro seul laissait planer l'ambiguïté quand plusieurs demandes
  // portaient le même titre. Sans réservation, on retombe sur le prospect —
  // souvent le seul nom connu d'une demande entrante.
  const bookingDate = task.booking?.booking_date
    ? new Date(`${task.booking.booking_date}T00:00:00`).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
      })
    : null;
  const prospectName = `${task.prospect_first_name ?? ""} ${task.prospect_last_name ?? ""}`.trim();
  const customerLabel =
    task.customer != null
      ? `${task.customer.first_name ?? ""} ${task.customer.last_name ?? ""}`.trim()
      : null;
  const bookingClient =
    task.booking != null
      ? `${task.booking.client_first_name ?? ""} ${task.booking.client_last_name ?? ""}`.trim()
      : null;

  const headline =
    task.booking != null
      ? [bookingLabel, bookingClient || null, bookingDate].filter(Boolean).join(" · ")
      : prospectName || null;

  return {
    t,
    priority,
    status,
    dueDate,
    dueDateLong,
    isOverdue,
    bookingLabel,
    customerLabel,
    bookingClient,
    headline,
  };
}

interface TaskCardVisualProps extends HTMLAttributes<HTMLDivElement> {
  task: Task;
  assigneeName: string | null;
  assigneeImage: string | null;
  /** Ghost laissé en place pendant le drag (opacité réduite). */
  dragging?: boolean;
}

/**
 * Rendu visuel pur de la carte — partagé entre la carte sortable et le
 * DragOverlay (qui la porte dans un portail pour suivre le curseur sans être
 * clippée par le conteneur `overflow-x-auto` des colonnes).
 */
export const TaskCardVisual = forwardRef<HTMLDivElement, TaskCardVisualProps>(
  function TaskCardVisual({ task, assigneeName, assigneeImage, dragging, className, ...rest }, ref) {
    const { t, priority, dueDate, isOverdue, customerLabel, headline } = useTaskCardData(task);
    const PriorityIcon = priority.icon;

    return (
      <div
        ref={ref}
        className={cn(
          "group cursor-pointer rounded-lg border border-border bg-card p-3 shadow-sm transition-colors hover:border-gold-300",
          dragging && "opacity-50 ring-2 ring-gold-300",
          className,
        )}
        {...rest}
      >
        {headline && (
          <div className="mb-1 flex items-center gap-1.5">
            {task.booking ? (
              <a
                href={`/admin/bookings/${task.booking.id}`}
                target="_blank"
                rel="noopener noreferrer"
                // Le clic ouvrirait la tâche et amorcerait un drag : on isole le
                // lien des deux gestes du parent.
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                className="truncate text-[11px] font-medium text-primary hover:underline"
              >
                {headline}
              </a>
            ) : (
              <span className="truncate text-[11px] font-medium text-muted-foreground">
                {headline}
              </span>
            )}
          </div>
        )}

        <div className="mb-2 flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-snug text-foreground">{task.title}</p>
          <Badge className={cn("shrink-0 gap-1 text-[10px] font-medium", priority.badgeClass)}>
            <PriorityIcon className="h-3 w-3" />
            {t(`tasks.priority.${task.priority}`)}
          </Badge>
        </div>

        {task.description && (
          <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
        )}

        {(customerLabel || task.task_type || task.channel || task.feedback_type || task.message_count > 0 ||
          task.comment_count > 0) && (
          <div className="mb-2 flex flex-wrap gap-1">
            {/* Le type porte la couleur du badge : c'est lui qui dit de quelle
                nature est la demande, avant même son canal. */}
            {task.task_type && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px]",
                  TASK_TYPE_META[task.task_type as keyof typeof TASK_TYPE_META]?.badgeClass ??
                    "bg-muted text-muted-foreground",
                )}
              >
                {task.task_type === "other" && task.task_type_other
                  ? task.task_type_other
                  : t(`tasks.type.${task.task_type}`, { defaultValue: task.task_type })}
              </span>
            )}
            {customerLabel && (
              <a
                href={task.customer ? `/admin/customers/${task.customer.id}` : undefined}
                target="_blank"
                rel="noopener noreferrer"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:underline"
              >
                <User className="h-2.5 w-2.5" />
                {customerLabel}
              </a>
            )}
            {task.channel && (
              <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {(() => {
                  const meta = TASK_CHANNEL_META[task.channel as TaskChannel];
                  if (!meta) return null;
                  const Icon = meta.icon;
                  return <Icon className="h-2.5 w-2.5" />;
                })()}
                {t(`tasks.channel.${task.channel}`, { defaultValue: task.channel })}
              </span>
            )}
            {task.feedback_type && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {t(`tasks.feedbackType.${task.feedback_type}`, { defaultValue: task.feedback_type })}
              </span>
            )}
            {task.message_count > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                <MessagesSquare className="h-2.5 w-2.5" />
                {task.message_count}
              </span>
            )}
            {task.comment_count > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                title={t("tasks.comments.count", { count: task.comment_count })}
              >
                <MessageSquare className="h-2.5 w-2.5" />
                {task.comment_count}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          {dueDate ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11px]",
                isOverdue ? "text-red-600" : "text-muted-foreground",
              )}
            >
              {task.status === "done" ? (
                <CalendarCheck2 className="h-3 w-3" />
              ) : (
                <CalendarClock className="h-3 w-3" />
              )}
              {dueDate}
            </span>
          ) : (
            <span />
          )}

          {assigneeName && (
            <Avatar className="h-6 w-6">
              {assigneeImage && <AvatarImage src={assigneeImage} alt={assigneeName} />}
              <AvatarFallback className="text-[10px]">{initials(assigneeName)}</AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
    );
  },
);

export function TaskCard({ task, assigneeName, assigneeImage, onOpen }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });
  const { t, priority, status, dueDateLong, isOverdue, bookingLabel, customerLabel, bookingClient } =
    useTaskCardData(task);
  const PriorityIcon = priority.icon;

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <HoverCard openDelay={350} closeDelay={80} {...(isDragging ? { open: false } : {})}>
      <HoverCardTrigger asChild>
        <TaskCardVisual
          ref={setNodeRef}
          task={task}
          assigneeName={assigneeName}
          assigneeImage={assigneeImage}
          dragging={isDragging}
          style={style}
          onClick={() => onOpen(task)}
          {...attributes}
          {...listeners}
        />
      </HoverCardTrigger>
      <HoverCardContent align="start" side="right" className="w-72">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-snug text-foreground">{task.title}</p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Badge className={cn("gap-1 text-[10px] font-medium", priority.badgeClass)}>
              <PriorityIcon className="h-3 w-3" />
              {t(`tasks.priority.${task.priority}`)}
            </Badge>
            <Badge className={cn("text-[10px] font-medium", status.badgeClass)}>
              {t(`tasks.status.${task.status}`)}
            </Badge>
          </div>

          {task.description && (
            <p className="text-xs text-muted-foreground">{task.description}</p>
          )}

          <div className="space-y-1.5 text-xs">
            {dueDateLong && (
              <div className="flex items-center gap-2">
                <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className={cn(isOverdue ? "text-red-600" : "text-foreground")}>
                  {dueDateLong}
                </span>
              </div>
            )}
            {assigneeName && (
              <div className="flex items-center gap-2">
                <Avatar className="h-4 w-4">
                  {assigneeImage && <AvatarImage src={assigneeImage} alt={assigneeName} />}
                  <AvatarFallback className="text-[8px]">{initials(assigneeName)}</AvatarFallback>
                </Avatar>
                <span className="text-foreground">{assigneeName}</span>
              </div>
            )}
            {bookingLabel && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarCheck2 className="h-3.5 w-3.5" />
                <span>
                  {t("tasks.card.booking")} {bookingLabel}
                  {bookingClient ? ` · ${bookingClient}` : ""}
                </span>
              </div>
            )}
            {customerLabel && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                <span>{customerLabel}</span>
              </div>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
