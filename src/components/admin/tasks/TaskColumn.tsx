import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Task } from "@/hooks/tasks/useTasks";
import { TaskCard } from "./TaskCard";
import type { TaskGroupBy } from "./taskDnd";

/** Préfixe i18n des libellés de colonne, par dimension de regroupement. */
const LABEL_PREFIX: Record<TaskGroupBy, string> = {
  status: "tasks.status",
  priority: "tasks.priority",
  task_type: "tasks.type",
};

interface TaskColumnProps {
  /** Valeur de la colonne dans la dimension courante (statut, priorité ou type). */
  columnId: string;
  groupBy: TaskGroupBy;
  tasks: Task[];
  assigneeOf: (userId: string | null) => { name: string | null; image: string | null };
  onOpenTask: (task: Task) => void;
}

export function TaskColumn({
  columnId,
  groupBy,
  tasks,
  assigneeOf,
  onOpenTask,
}: TaskColumnProps) {
  const { t } = useTranslation("admin");
  const { setNodeRef, isOver } = useDroppable({ id: columnId });

  return (
    <div className="flex min-w-[280px] flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-sm font-medium text-foreground">{t(`${LABEL_PREFIX[groupBy]}.${columnId}`, { defaultValue: columnId })}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-1 flex-col gap-2 rounded-lg border border-dashed border-transparent p-2 transition-colors",
          isOver && "border-gold-300 bg-gold-50/50",
        )}
      >
        <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => {
            const assignee = assigneeOf(task.assigned_to_user_id);
            return (
              <TaskCard
                key={task.id}
                task={task}
                assigneeName={assignee.name}
                assigneeImage={assignee.image}
                onOpen={onOpenTask}
              />
            );
          })}
        </SortableContext>
        {tasks.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {t("tasks.emptyColumn")}
          </p>
        )}
      </div>
    </div>
  );
}
