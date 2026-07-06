import { useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { Task, TaskStatus } from "@/hooks/tasks/useTasks";
import { TASK_STATUS_ORDER } from "./taskConstants";
import { groupByStatus, resolveTaskDrop } from "./taskDnd";
import { TaskColumn } from "./TaskColumn";
import { TaskCardVisual } from "./TaskCard";

interface TaskBoardProps {
  tasks: Task[];
  assigneeOf: (userId: string | null) => { name: string | null; image: string | null };
  onOpenTask: (task: Task) => void;
  onMove: (input: { id: string; status: TaskStatus; position: number }) => void;
}

export function TaskBoard({ tasks, assigneeOf, onOpenTask, onMove }: TaskBoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columns = useMemo(() => groupByStatus(tasks), [tasks]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeTask = activeId ? tasks.find((task) => task.id === activeId) ?? null : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const result = resolveTaskDrop({
      tasks,
      activeId: String(active.id),
      overId: String(over.id),
    });
    if (result) onMove(result);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-4 overflow-x-auto pb-2">
        {TASK_STATUS_ORDER.map((status) => (
          <TaskColumn
            key={status}
            status={status}
            tasks={columns[status]}
            assigneeOf={assigneeOf}
            onOpenTask={onOpenTask}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <TaskCardVisual
            task={activeTask}
            assigneeName={assigneeOf(activeTask.assigned_to_user_id).name}
            assigneeImage={assigneeOf(activeTask.assigned_to_user_id).image}
            className="rotate-2 cursor-grabbing shadow-lg ring-2 ring-gold-300"
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
