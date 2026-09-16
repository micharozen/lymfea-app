import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgScope } from "@/hooks/useOrgScope";
import { useUser } from "@/contexts/UserContext";
import {
  listTaskComments,
  createTaskComment,
  updateTaskComment,
  deleteTaskComment,
  taskCommentKeys,
  taskKeys,
  type TaskComment,
} from "@shared/db";
import { useOrgAdmins } from "@/hooks/tasks/useOrgAdmins";
import { collectMentionedUserIds } from "@/components/admin/tasks/mentions";

export type { TaskComment };

export function useTaskComments(taskId: string) {
  return useQuery({
    queryKey: taskCommentKeys.forTask(taskId),
    enabled: Boolean(taskId),
    staleTime: 30_000,
    queryFn: () => listTaskComments(supabase, taskId),
  });
}

// Notifie les collègues mentionnés. Insert direct depuis le client, autorisé
// par la policy « System can create notifications » qui vérifie seulement que
// le destinataire est un membre du staff. L'auteur ne se notifie jamais
// lui-même, et un échec de notification ne doit pas perdre le commentaire.
async function notifyMentions(params: {
  mentionedUserIds: string[];
  author: string | null;
  taskId: string;
  taskTitle: string;
  authorName: string;
}): Promise<void> {
  const { mentionedUserIds, author, taskId, taskTitle, authorName } = params;
  const recipients = mentionedUserIds.filter((id) => id !== author);
  if (recipients.length === 0) return;

  const { error } = await supabase.from("notifications").insert(
    recipients.map((userId) => ({
      user_id: userId,
      task_id: taskId,
      type: "task_comment_mention",
      message: `💬 ${authorName} vous a mentionné : ${taskTitle}`,
    })),
  );
  if (error) console.error("Failed to create mention notifications", error);
}

interface CreateCommentInput {
  content: string;
  /** Non nul = réponse à ce commentaire racine. */
  parentCommentId?: string | null;
}

interface UpdateCommentInput {
  id: string;
  content: string;
}

/**
 * Mutations du fil d'une tâche. Chaque écriture invalide le fil **et** la
 * liste des tâches, dont les cartes portent le compteur de commentaires.
 */
export function useTaskCommentMutations(params: {
  taskId: string;
  taskTitle: string;
  authorName: string;
}) {
  const { taskId, taskTitle, authorName } = params;
  const scope = useOrgScope();
  const { userId } = useUser();
  const { data: admins = [] } = useOrgAdmins();
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: taskCommentKeys.forTask(taskId) });
    queryClient.invalidateQueries({ queryKey: taskKeys.all });
  };

  const create = useMutation({
    mutationFn: async (input: CreateCommentInput) => {
      const organizationId =
        scope && "organizationId" in scope ? scope.organizationId : undefined;
      if (!organizationId) {
        throw new Error("Sélectionnez une organisation pour commenter une tâche.");
      }
      if (!userId) throw new Error("Non authentifié.");

      const mentionedUserIds = collectMentionedUserIds(input.content, admins);
      const comment = await createTaskComment(supabase, {
        task_id: taskId,
        organization_id: organizationId,
        parent_comment_id: input.parentCommentId ?? null,
        author_user_id: userId,
        content: input.content,
        mentioned_user_ids: mentionedUserIds,
      });
      await notifyMentions({
        mentionedUserIds,
        author: userId,
        taskId,
        taskTitle,
        authorName,
      });
      return comment;
    },
    onSuccess: invalidate,
  });

  // À l'édition, on ne notifie que les personnes nouvellement mentionnées :
  // corriger une faute de frappe ne doit pas renotifier tout le fil.
  const update = useMutation({
    mutationFn: async (input: UpdateCommentInput) => {
      const previous = queryClient
        .getQueryData<TaskComment[]>(taskCommentKeys.forTask(taskId))
        ?.find((comment) => comment.id === input.id);
      const mentionedUserIds = collectMentionedUserIds(input.content, admins);
      const comment = await updateTaskComment(
        supabase,
        input.id,
        input.content,
        mentionedUserIds,
      );
      const alreadyNotified = new Set(previous?.mentioned_user_ids ?? []);
      await notifyMentions({
        mentionedUserIds: mentionedUserIds.filter((id) => !alreadyNotified.has(id)),
        author: userId,
        taskId,
        taskTitle,
        authorName,
      });
      return comment;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteTaskComment(supabase, id),
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
