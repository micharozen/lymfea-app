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
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { listHotelsForOrgDropdown, hotelKeys } from "@shared/db";
import { useOrgScope } from "@/hooks/useOrgScope";
import { useTasks, type Task } from "@/hooks/tasks/useTasks";
import { useOrgAdmins } from "@/hooks/tasks/useOrgAdmins";
import { useTaskMutations } from "@/hooks/tasks/useTaskMutations";
import { TaskBoard } from "@/components/admin/tasks/TaskBoard";
import { TaskFilterBar, type TaskFilterDef } from "@/components/admin/tasks/TaskFilterBar";
import { GROUP_BY_CONFIG, type TaskGroupBy } from "@/components/admin/tasks/taskDnd";
import { SelectField, type SelectFieldOption } from "@/components/ui/select-field";
import { TaskDialog } from "@/components/admin/tasks/TaskDialog";
import {
  PRIORITY_ORDER,
  TASK_CHANNEL_META,
  TASK_CHANNEL_ORDER,
  TASK_FEEDBACK_TYPE_ORDER,
  TASK_TYPE_ORDER,
} from "@/components/admin/tasks/taskConstants";

export default function Tasks() {
  const { t } = useTranslation("admin");
  const { data: tasks = [], isLoading } = useTasks();
  const { data: admins = [] } = useOrgAdmins();
  const { move } = useTaskMutations();
  const scope = useOrgScope();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: hotels = [] } = useQuery({
    queryKey: hotelKeys.dropdown(scope),
    enabled: !!scope,
    queryFn: () => listHotelsForOrgDropdown(supabase, scope!),
  });

  const [search, setSearch] = useState("");
  // Les filtres vivent dans un seul objet : la barre les ajoute et les retire
  // à la demande, plutôt que d'aligner six sélecteurs en permanence.
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [visibleFilters, setVisibleFilters] = useState<string[]>([]);
  // Dimension du board : statut par défaut, mais on peut aussi lire le travail
  // par priorité ou par type de demande.
  const [groupBy, setGroupBy] = useState<TaskGroupBy>("status");

  const setFilterValue = (key: string, value: string) =>
    setFilterValues((prev) => ({ ...prev, [key]: value }));

  const valueOf = (key: string) => filterValues[key] ?? "all";
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
      const matches = (key: string, actual: string | null) => {
        const expected = filterValues[key] ?? "all";
        return expected === "all" || actual === expected;
      };
      if (!matches("priority", task.priority)) return false;
      if (!matches("assignee", task.assigned_to_user_id)) return false;
      if (!matches("venue", task.hotel_id)) return false;
      if (!matches("type", task.task_type)) return false;
      if (!matches("channel", task.channel)) return false;
      if (!matches("feedback", task.feedback_type)) return false;
      if (q) {
        // Le prospect fait partie de la recherche : sur une demande entrante,
        // c'est souvent le seul nom disponible (aucune fiche client encore).
        const haystack = [
          task.title,
          task.description ?? "",
          task.prospect_first_name ?? "",
          task.prospect_last_name ?? "",
          task.prospect_email ?? "",
          task.prospect_phone ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, search, filterValues]);

  const filterDefs: TaskFilterDef[] = useMemo(() => {
    // Le nom du filtre est affiché juste avant la valeur : « Canal · Tous les
    // canaux » serait redondant, un simple « Tous » suffit.
    const withAll = (options: SelectFieldOption[]): SelectFieldOption[] => [
      { value: "all", label: t("tasks.filterAll") },
      ...options,
    ];
    return [
      {
        key: "priority",
        label: t("tasks.fields.priority"),
        options: withAll(
          PRIORITY_ORDER.map((p) => ({ value: p, label: t(`tasks.priority.${p}`) })),
        ),
      },
      {
        key: "assignee",
        label: t("tasks.fields.assignee"),
        options: withAll(
          admins.map((a) => ({
            value: a.user_id,
            label: `${a.first_name} ${a.last_name}`.trim(),
          })),
        ),
      },
      {
        key: "venue",
        label: t("tasks.fields.venue"),
        options: withAll(
          hotels.map((hotel) => ({ value: hotel.id, label: hotel.name })),
        ),
      },
      {
        key: "type",
        label: t("tasks.fields.taskType"),
        options: withAll(
          TASK_TYPE_ORDER.map((type) => ({ value: type, label: t(`tasks.type.${type}`) })),
        ),
      },
      {
        key: "channel",
        label: t("tasks.fields.channel"),
        options: withAll(
          TASK_CHANNEL_ORDER.map((channel) => {
            const Icon = TASK_CHANNEL_META[channel].icon;
            return {
              value: channel,
              label: t(`tasks.channel.${channel}`),
              icon: <Icon className="h-4 w-4" />,
            };
          }),
        ),
      },
      {
        key: "feedback",
        label: t("tasks.fields.feedbackType"),
        options: withAll(
          TASK_FEEDBACK_TYPE_ORDER.map((value) => ({
            value,
            label: t(`tasks.feedbackType.${value}`),
          })),
        ),
      },
    ];
  }, [t, admins, hotels]);

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
          <SelectField
            options={(Object.keys(GROUP_BY_CONFIG) as TaskGroupBy[]).map((value) => ({
              value,
              label: t(`tasks.groupBy.${value}`),
            }))}
            value={groupBy}
            onChange={(value) => setGroupBy(value as TaskGroupBy)}
            searchable={false}
            aria-label={t("tasks.groupByLabel")}
            className="h-9 w-[190px]"
          />
          <TaskFilterBar
            filters={filterDefs}
            values={filterValues}
            onChange={setFilterValue}
            visibleKeys={visibleFilters}
            onVisibleKeysChange={setVisibleFilters}
          />
        </div>
      </div>

      <div className={cn("flex-1 px-4 md:px-6 pb-4 md:pb-6")}>
        {isLoading ? (
          <p className="text-muted-foreground py-12 text-center text-sm">{t("common.loading")}</p>
        ) : (
          <TaskBoard
            tasks={filteredTasks}
            groupBy={groupBy}
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
