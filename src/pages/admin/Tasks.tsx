import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Search, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTasks, type Task } from "@/hooks/tasks/useTasks";
import { useOrgAdmins } from "@/hooks/tasks/useOrgAdmins";
import { useTaskMutations } from "@/hooks/tasks/useTaskMutations";
import { TaskBoard } from "@/components/admin/tasks/TaskBoard";
import { TaskDialog } from "@/components/admin/tasks/TaskDialog";
import { PRIORITY_ORDER } from "@/components/admin/tasks/taskConstants";

export default function Tasks() {
  const { t } = useTranslation("admin");
  const { data: tasks = [], isLoading } = useTasks();
  const { data: admins = [] } = useOrgAdmins();
  const { move } = useTaskMutations();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Resolve an assignee user_id to a display name/avatar via the admins list.
  const assigneeOf = useMemo(() => {
    const map = new Map(admins.map((a) => [a.user_id, a]));
    return (userId: string | null) => {
      if (!userId) return { name: null, image: null };
      const admin = map.get(userId);
      return admin
        ? { name: `${admin.first_name} ${admin.last_name}`.trim(), image: admin.profile_image }
        : { name: null, image: null };
    };
  }, [admins]);

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
      if (assigneeFilter !== "all" && task.assigned_to_user_id !== assigneeFilter) return false;
      if (q) {
        const haystack = `${task.title} ${task.description ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, search, priorityFilter, assigneeFilter]);

  // Deep-link from a notification: ?task=<id> opens that task once loaded.
  useEffect(() => {
    const taskId = searchParams.get("task");
    if (!taskId || tasks.length === 0) return;
    const target = tasks.find((task) => task.id === taskId);
    if (target) {
      setEditingTask(target);
      setDialogOpen(true);
    }
    searchParams.delete("task");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, tasks, setSearchParams]);

  const openNew = () => {
    setEditingTask(null);
    setDialogOpen(true);
  };

  const openTask = (task: Task) => {
    setEditingTask(task);
    setDialogOpen(true);
  };

  return (
    <div className="bg-background flex min-h-0 flex-col">
      <div className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-medium tracking-tight">
              <ListTodo className="h-5 w-5" />
              {t("tasks.title")}
            </h1>
            <p className="text-muted-foreground mt-1">{t("tasks.description")}</p>
          </div>
          <Button className="flex-shrink-0" onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            {t("tasks.new")}
          </Button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder={t("tasks.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("tasks.allPriorities")}</SelectItem>
              {PRIORITY_ORDER.map((p) => (
                <SelectItem key={p} value={p}>
                  {t(`tasks.priority.${p}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("tasks.allAssignees")}</SelectItem>
              {admins.map((a) => (
                <SelectItem key={a.user_id} value={a.user_id}>
                  {a.first_name} {a.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className={cn("flex-1 px-4 md:px-6 pb-4 md:pb-6")}>
        {isLoading ? (
          <p className="text-muted-foreground py-12 text-center text-sm">{t("common.loading")}</p>
        ) : (
          <TaskBoard
            tasks={filteredTasks}
            assigneeOf={assigneeOf}
            onOpenTask={openTask}
            onMove={move.mutate}
          />
        )}
      </div>

      <TaskDialog open={dialogOpen} onClose={() => setDialogOpen(false)} task={editingTask} />
    </div>
  );
}
