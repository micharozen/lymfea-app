import { PRIORITY_ORDER, TASK_STATUS_ORDER, TASK_TYPE_ORDER } from "./taskConstants";
import type { TaskStatus } from "@/hooks/tasks/useTasks";

/** Dimension selon laquelle le board est découpé en colonnes. */
export type TaskGroupBy = "status" | "priority" | "task_type";

/** Colonnes et valeur de repli de chaque dimension de regroupement. */
export const GROUP_BY_CONFIG: Record<
  TaskGroupBy,
  { columns: readonly string[]; fallback: string }
> = {
  status: { columns: TASK_STATUS_ORDER, fallback: "todo" },
  priority: { columns: PRIORITY_ORDER, fallback: "medium" },
  task_type: { columns: TASK_TYPE_ORDER, fallback: "other" },
};

// Pure, framework-agnostic Kanban logic — no React/@dnd-kit imports so it can
// be unit-tested in isolation.

export interface DnDTask {
  id: string;
  status: string;
  priority?: string;
  task_type?: string;
  position: number;
  created_at: string;
}

export interface TaskDropResult {
  id: string;
  /** Dimension déplacée, et sa nouvelle valeur : déplacer une carte dans un
   *  board groupé par priorité change la priorité, pas le statut. */
  groupBy: TaskGroupBy;
  value: string;
  position: number;
  /** Conservé pour les appelants groupés par statut. */
  status: TaskStatus;
}

// Within a column: by position asc, then most recent first (matches the
// server-side ordering in listTasksForOrg).
export function sortColumn<T extends DnDTask>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return a.created_at < b.created_at ? 1 : -1;
  });
}

/** Valeur de regroupement d'une tâche, repliée sur la colonne par défaut quand
 *  le champ est vide ou hors domaine. */
export function groupValueOf(task: DnDTask, groupBy: TaskGroupBy): string {
  const { columns, fallback } = GROUP_BY_CONFIG[groupBy];
  const raw = groupBy === "status" ? task.status : groupBy === "priority" ? task.priority : task.task_type;
  return raw && columns.includes(raw) ? raw : fallback;
}

/** Répartit les tâches en colonnes selon la dimension demandée. */
export function groupTasks<T extends DnDTask>(
  tasks: T[],
  groupBy: TaskGroupBy,
): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const column of GROUP_BY_CONFIG[groupBy].columns) grouped[column] = [];
  for (const task of tasks) grouped[groupValueOf(task, groupBy)].push(task);
  for (const column of Object.keys(grouped)) grouped[column] = sortColumn(grouped[column]);
  return grouped;
}

export function groupByStatus<T extends DnDTask>(tasks: T[]): Record<TaskStatus, T[]> {
  return groupTasks(tasks, "status") as Record<TaskStatus, T[]>;
}

// Given the dragged card (activeId) and the drop target (overId — either a
// column status id or another card id), computes the new status + fractional
// position. Returns null when the move is a no-op or the active card is gone.
export function resolveTaskDrop<T extends DnDTask>(params: {
  tasks: T[];
  activeId: string;
  overId: string;
  /** Dimension du board ; "status" par défaut (comportement historique). */
  groupBy?: TaskGroupBy;
}): TaskDropResult | null {
  const { tasks, activeId, overId, groupBy = "status" } = params;

  const activeTask = tasks.find((task) => task.id === activeId);
  if (!activeTask) return null;

  const columns = groupTasks(tasks, groupBy);
  const activeValue = groupValueOf(activeTask, groupBy);

  const overIsColumn = GROUP_BY_CONFIG[groupBy].columns.includes(overId);
  const overTask = tasks.find((task) => task.id === overId);
  const targetValue = overIsColumn
    ? overId
    : overTask
      ? groupValueOf(overTask, groupBy)
      : activeValue;

  const columnTasks = columns[targetValue].filter((task) => task.id !== activeId);

  let index = columnTasks.length;
  if (!overIsColumn) {
    const overIndex = columnTasks.findIndex((task) => task.id === overId);
    if (overIndex !== -1) index = overIndex;
  }

  const prev = columnTasks[index - 1];
  const next = columnTasks[index];
  let position: number;
  if (prev && next) position = (prev.position + next.position) / 2;
  else if (prev) position = prev.position + 1;
  else if (next) position = next.position - 1;
  else position = 0;

  if (targetValue === activeValue && position === activeTask.position) {
    return null;
  }

  return {
    id: activeId,
    groupBy,
    value: targetValue,
    position,
    // Groupé autrement que par statut, le statut ne change pas.
    status: (groupBy === "status" ? targetValue : activeTask.status) as TaskStatus,
  };
}
