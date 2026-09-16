import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TaskMessageRef {
  id: string;
  channel: string;
  direction: string;
  subject: string | null;
  parent_message_id: string | null;
  created_at: string;
}

/**
 * Messages rattachés à une tâche, tous canaux confondus.
 *
 * Le fil lui-même est rendu par `InquiryThreadView`, qui part du message
 * racine : on ne ramène donc ici que de quoi identifier cette racine et savoir
 * s'il y a une conversation à afficher. Une tâche née d'un appel ou d'un
 * walk-in n'a aucun message — la section reste alors masquée.
 */
export function useTaskMessages(taskId: string | null | undefined) {
  return useQuery({
    queryKey: ["task-messages", taskId],
    enabled: Boolean(taskId),
    staleTime: 30 * 1000,
    queryFn: async (): Promise<TaskMessageRef[]> => {
      const { data, error } = await supabase
        .from("channel_messages" as never)
        .select("id, channel, direction, subject, parent_message_id, created_at")
        .eq("task_id", taskId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as TaskMessageRef[];
    },
  });
}

/** Racine du fil : le message entrant d'origine, sinon le plus ancien. */
export function rootMessageOf(messages: TaskMessageRef[] | undefined): TaskMessageRef | null {
  if (!messages || messages.length === 0) return null;
  return messages.find((m) => m.parent_message_id === null) ?? messages[0];
}
