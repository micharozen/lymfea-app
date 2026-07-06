import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgScope } from "@/hooks/useOrgScope";
import { listTasksForOrg, taskKeys, type TaskWithLinks } from "@shared/db";

export type Task = TaskWithLinks;
export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];
export const TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];

// Loads the org's tasks and keeps them live across admin sessions via the
// `tasks` realtime publication (added in migration 20260705150000).
export function useTasks() {
  const scope = useOrgScope();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: taskKeys.list(scope),
    enabled: scope !== null,
    queryFn: () => listTasksForOrg(supabase, scope!),
    staleTime: 30_000,
  });

  useEffect(() => {
    // Unique channel name per mount: with a fixed name, React 18 StrictMode's
    // double-invoke would re-grab the still-subscribing channel and re-attaching
    // postgres_changes throws "cannot add callbacks after subscribe()".
    const channel = supabase
      .channel(`tasks-realtime-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => {
          queryClient.invalidateQueries({ queryKey: taskKeys.all });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}
