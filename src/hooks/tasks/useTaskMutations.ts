import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgScope } from "@/hooks/useOrgScope";
import { useUser } from "@/contexts/UserContext";
import {
  createTask as createTaskDb,
  updateTask as updateTaskDb,
  deleteTask as deleteTaskDb,
  taskKeys,
  type TaskChecklistItem,
} from "@shared/db";
import type { Database, Json } from "@/integrations/supabase/types";
import type { TaskGroupBy } from "@/components/admin/tasks/taskDnd";
import type {
  TaskStatus,
  TaskPriority,
  TaskType,
  TaskChannel,
  TaskFeedbackType,
} from "./useTasks";

type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];
type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];

/** Champs communs à la création et à la mise à jour d'une tâche. */
interface TaskFields {
  title: string;
  description?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  task_type: TaskType;
  task_type_other?: string | null;
  treatment_menu_ids?: string[];
  therapist_ids?: string[];
  checklist?: TaskChecklistItem[];
  attachments?: string[];
  due_date?: string | null;
  hotel_id?: string | null;
  booking_id?: string | null;
  customer_id?: string | null;
  assigned_to_user_id?: string | null;
  channel?: TaskChannel | string | null;
  feedback_type?: TaskFeedbackType | string | null;
  /** Même domaine que bookings.client_type, repris tel quel à la conversion. */
  client_type?: string | null;
  /** Date du soin demandé — distincte de due_date, l'échéance de la tâche. */
  treatment_date?: string | null;
  /** Coordonnées saisies avant qu'une fiche client n'existe. */
  prospect_first_name?: string | null;
  prospect_last_name?: string | null;
  prospect_email?: string | null;
  prospect_phone?: string | null;
  converted_booking_id?: string | null;
}

export type CreateTaskInput = TaskFields;

export interface UpdateTaskInput extends TaskFields {
  id: string;
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

// Colonnes écrites à l'identique par la création et la mise à jour. `checklist`
// part telle quelle dans la colonne jsonb : aucune écriture secondaire.
function taskColumns(input: TaskFields) {
  return {
    title: input.title,
    description: input.description ?? null,
    priority: input.priority,
    status: input.status,
    task_type: input.task_type,
    task_type_other: input.task_type_other ?? null,
    treatment_menu_ids: input.treatment_menu_ids ?? [],
    therapist_ids: input.therapist_ids ?? [],
    checklist: (input.checklist ?? []) as unknown as Json,
    attachments: input.attachments ?? [],
    due_date: input.due_date ?? null,
    hotel_id: input.hotel_id ?? null,
    booking_id: input.booking_id ?? null,
    customer_id: input.customer_id ?? null,
    assigned_to_user_id: input.assigned_to_user_id ?? null,
    channel: input.channel ?? null,
    feedback_type: input.feedback_type ?? null,
    client_type: input.client_type ?? null,
    treatment_date: input.treatment_date ?? null,
    prospect_first_name: input.prospect_first_name ?? null,
    prospect_last_name: input.prospect_last_name ?? null,
    prospect_email: input.prospect_email ?? null,
    prospect_phone: input.prospect_phone ?? null,
    converted_booking_id: input.converted_booking_id ?? null,
    completed_at: input.status === "done" ? new Date().toISOString() : null,
  };
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
        ...taskColumns(input),
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
      const patch: TaskUpdate = taskColumns(input);
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
  // Le board se groupe par statut, priorité ou type : un glisser-déposer écrit
  // la colonne de la dimension affichée, et elle seule. `completed_at` ne suit
  // que le statut — déplacer une carte dans la colonne « Urgente » ne doit pas
  // la marquer terminée.
  const move = useMutation({
    mutationFn: async (input: {
      id: string;
      groupBy: TaskGroupBy;
      value: string;
      position: number;
    }) => {
      const patch: TaskUpdate = { position: input.position };
      if (input.groupBy === "status") {
        patch.status = input.value;
        patch.completed_at = input.value === "done" ? new Date().toISOString() : null;
      } else if (input.groupBy === "priority") {
        patch.priority = input.value;
      } else {
        patch.task_type = input.value;
      }
      return updateTaskDb(supabase, input.id, patch);
    },
    onSuccess: invalidate,
  });

  // Édition inline : on écrit un seul champ à la fois, sans repasser par
  // taskColumns() qui réécrit la ligne entière. `completed_at` reste couplé au
  // statut, où qu'il soit modifié.
  const patch = useMutation({
    mutationFn: async ({ id, ...fields }: { id: string } & TaskUpdate) => {
      const next: TaskUpdate = { ...fields };
      if (typeof fields.status === "string") {
        next.completed_at = fields.status === "done" ? new Date().toISOString() : null;
      }
      return updateTaskDb(supabase, id, next);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteTaskDb(supabase, id),
    onSuccess: invalidate,
  });

  return { create, update, move, patch, remove };
}
