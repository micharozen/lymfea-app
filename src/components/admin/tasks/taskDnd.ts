import { TASK_STATUS_ORDER } from "./taskConstants";
import type { TaskStatus } from "@/hooks/tasks/useTasks";

// Pure, framework-agnostic Kanban logic — no React/@dnd-kit imports so it can
// be unit-tested in isolation.

export interface DnDTask {
  id: string;
  status: string;
  position: number;
  created_at: string;
}

export interface TaskDropResult {
  id: string;
  status: TaskStatus;
  position: number;
}

// Within a column: by position asc, then most recent first (matches the
// server-side ordering in listTasksForOrg).
export function sortColumn<T extends DnDTask>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return a.created_at < b.created_at ? 1 : -1;
  });
}

export function groupByStatus<T extends DnDTask>(tasks: T[]): Record<TaskStatus, T[]> {
  const grouped: Record<TaskStatus, T[]> = { todo: [], in_progress: [], done: [] };
  for (const task of tasks) {
    const status = ((TASK_STATUS_ORDER as string[]).includes(task.status)
      ? task.status
      : "todo") as TaskStatus;
    grouped[status].push(task);
  }
  return {
    todo: sortColumn(grouped.todo),
    in_progress: sortColumn(grouped.in_progress),
    done: sortColumn(grouped.done),
  };
}

// Given the dragged card (activeId) and the drop target (overId — either a
// column status id or another card id), computes the new status + fractional
// position. Returns null when the move is a no-op or the active card is gone.
export function resolveTaskDrop<T extends DnDTask>(params: {
  tasks: T[];
  activeId: string;
  overId: string;
}): TaskDropResult | null {
  const { tasks, activeId, overId } = params;

  const activeTask = tasks.find((task) => task.id === activeId);
  if (!activeTask) return null;

  const columns = groupByStatus(tasks);

  const overIsColumn = (TASK_STATUS_ORDER as string[]).includes(overId);
  const targetStatus: TaskStatus = overIsColumn
    ? (overId as TaskStatus)
    : ((tasks.find((task) => task.id === overId)?.status as TaskStatus) ??
      (activeTask.status as TaskStatus));

  const columnTasks = columns[targetStatus].filter((task) => task.id !== activeId);

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

  if (targetStatus === activeTask.status && position === activeTask.position) {
    return null;
  }

  return { id: activeId, status: targetStatus, position };
}
