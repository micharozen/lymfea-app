import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgScope } from "@/hooks/useOrgScope";
import { useUser } from "@/contexts/UserContext";
import {
  createTask as createTaskDb,
  updateTask as updateTaskDb,
  deleteTask as deleteTaskDb,
  taskKeys,
} from "@shared/db";
import type { Database } from "@/integrations/supabase/types";
import type { TaskStatus, TaskPriority } from "./useTasks";

type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];
type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_date?: string | null;
  hotel_id?: string | null;
  booking_id?: string | null;
  customer_id?: string | null;
  assigned_to_user_id?: string | null;
}

export interface UpdateTaskInput {
  id: string;
  title: string;
  description?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_date?: string | null;
  hotel_id?: string | null;
  booking_id?: string | null;
  customer_id?: string | null;
  assigned_to_user_id?: string | null;
  previousAssignee?: string | null;
}

// Inserts an in-app notification for the assignee. Allowed straight from the
// client because the "System can create notifications" RLS policy authorizes
// inserts whose recipient is an admin. Never notifies the author of their own
// assignment.
async function notifyAssignee(params: {
  assignee: string | null | undefined;
  author: string | null;
  taskId: string;
  title: string;
}): Promise<void> {
  const { assignee, author, taskId, title } = params;
  if (!assignee || assignee === author) return;
  const { error } = await supabase.from("notifications").insert({
    user_id: assignee,
    task_id: taskId,
    type: "task_assigned",
    message: `📋 Nouvelle tâche : ${title}`,
  });
  // Notification failure must not fail the task write — surface via console only.
  if (error) console.error("Failed to create task notification", error);
}

export function useTaskMutations() {
  const scope = useOrgScope();
  const { userId } = useUser();
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: taskKeys.all });

  const create = useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      const organizationId =
        scope && "organizationId" in scope ? scope.organizationId : undefined;
      if (!organizationId) {
        throw new Error("Sélectionnez une organisation pour créer une tâche.");
      }
      const payload: TaskInsert = {
        organization_id: organizationId,
        created_by: userId,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        status: input.status,
        due_date: input.due_date ?? null,
        hotel_id: input.hotel_id ?? null,
        booking_id: input.booking_id ?? null,
        customer_id: input.customer_id ?? null,
        assigned_to_user_id: input.assigned_to_user_id ?? null,
        completed_at: input.status === "done" ? new Date().toISOString() : null,
      };
      const task = await createTaskDb(supabase, payload);
      await notifyAssignee({
        assignee: input.assigned_to_user_id,
        author: userId,
        taskId: task.id,
        title: task.title,
      });
      return task;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async (input: UpdateTaskInput) => {
      const patch: TaskUpdate = {
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        status: input.status,
        due_date: input.due_date ?? null,
        hotel_id: input.hotel_id ?? null,
        booking_id: input.booking_id ?? null,
        customer_id: input.customer_id ?? null,
        assigned_to_user_id: input.assigned_to_user_id ?? null,
        completed_at: input.status === "done" ? new Date().toISOString() : null,
      };
      const task = await updateTaskDb(supabase, input.id, patch);
      const reassigned =
        !!input.assigned_to_user_id &&
        input.assigned_to_user_id !== input.previousAssignee;
      if (reassigned) {
        await notifyAssignee({
          assignee: input.assigned_to_user_id,
          author: userId,
          taskId: task.id,
          title: task.title,
        });
      }
      return task;
    },
    onSuccess: invalidate,
  });

  // Column drag & drop: status + ordering only.
  const move = useMutation({
    mutationFn: async (input: { id: string; status: TaskStatus; position: number }) => {
      const patch: TaskUpdate = {
        status: input.status,
        position: input.position,
        completed_at: input.status === "done" ? new Date().toISOString() : null,
      };
      return updateTaskDb(supabase, input.id, patch);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteTaskDb(supabase, id),
    onSuccess: invalidate,
  });

  return { create, update, move, remove };
}
