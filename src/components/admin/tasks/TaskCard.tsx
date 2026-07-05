import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "react-i18next";
import { CalendarClock, CalendarCheck2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { Task, TaskPriority, TaskStatus } from "@/hooks/tasks/useTasks";
import { PRIORITY_META, STATUS_META } from "./taskConstants";

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

export function TaskCard({ task, assigneeName, assigneeImage, onOpen }: TaskCardProps) {
  const { t } = useTranslation("admin");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  const priority = PRIORITY_META[task.priority as TaskPriority] ?? PRIORITY_META.medium;
  const PriorityIcon = priority.icon;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

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

  const bookingLabel =
    task.booking != null
      ? `#${task.booking.booking_id ?? "?"}`
      : null;
  const customerLabel =
    task.customer != null
      ? `${task.customer.first_name ?? ""} ${task.customer.last_name ?? ""}`.trim()
      : null;
  const bookingClient =
    task.booking != null
      ? `${task.booking.client_first_name ?? ""} ${task.booking.client_last_name ?? ""}`.trim()
      : null;

  const card = (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task)}
      className={cn(
        "group cursor-pointer rounded-lg border border-border bg-card p-3 shadow-sm transition-colors hover:border-gold-300",
        isDragging && "opacity-50 ring-2 ring-gold-300",
      )}
    >
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

      {(bookingLabel || customerLabel) && (
        <div className="mb-2 flex flex-wrap gap-1">
          {bookingLabel && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {t("tasks.card.booking")} {bookingLabel}
            </span>
          )}
          {customerLabel && (
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <User className="h-2.5 w-2.5" />
              {customerLabel}
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

  return (
    <HoverCard openDelay={350} closeDelay={80}>
      <HoverCardTrigger asChild>{card}</HoverCardTrigger>
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
