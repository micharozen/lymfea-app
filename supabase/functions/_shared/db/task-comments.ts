import type { TClient, Database } from "./client.ts";

type TaskCommentRow = Database["public"]["Tables"]["task_comments"]["Row"];
type TaskCommentInsert = Database["public"]["Tables"]["task_comments"]["Insert"];

/**
 * Un message du fil d'une tâche. `parent_comment_id` non nul = réponse à une
 * racine ; le fil est limité à un niveau (trigger côté base).
 */
export type TaskComment = Pick<
  TaskCommentRow,
  | "id"
  | "task_id"
  | "parent_comment_id"
  | "author_user_id"
  | "content"
  | "mentioned_user_ids"
  | "created_at"
  | "updated_at"
>;

const TASK_COMMENT_SELECT =
  "id, task_id, parent_comment_id, author_user_id, content, mentioned_user_ids, created_at, updated_at";

/**
 * Le fil complet d'une tâche, racines et réponses mélangées, en une requête —
 * le regroupement se fait à l'affichage. Pas de filtre d'organisation : la RLS
 * cloisonne déjà, et une tâche n'appartient qu'à une organisation.
 */
export async function listTaskComments(
  client: TClient,
  taskId: string,
): Promise<TaskComment[]> {
  const { data, error } = await client
    .from("task_comments")
    .select(TASK_COMMENT_SELECT)
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TaskComment[];
}

export async function createTaskComment(
  client: TClient,
  payload: TaskCommentInsert,
): Promise<TaskComment> {
  const { data, error } = await client
    .from("task_comments")
    .insert(payload)
    .select(TASK_COMMENT_SELECT)
    .single();
  if (error) throw error;
  return data as TaskComment;
}

/**
 * Seuls le corps et les mentions sont modifiables : réaffecter un commentaire
 * à une autre tâche ou à un autre auteur n'a pas de sens dans un fil.
 */
export async function updateTaskComment(
  client: TClient,
  id: string,
  content: string,
  mentionedUserIds: string[],
): Promise<TaskComment> {
  const { data, error } = await client
    .from("task_comments")
    .update({ content, mentioned_user_ids: mentionedUserIds })
    .eq("id", id)
    .select(TASK_COMMENT_SELECT)
    .single();
  if (error) throw error;
  return data as TaskComment;
}

/** Supprimer une racine emporte ses réponses (ON DELETE CASCADE). */
export async function deleteTaskComment(client: TClient, id: string): Promise<void> {
  const { error } = await client.from("task_comments").delete().eq("id", id);
  if (error) throw error;
}
