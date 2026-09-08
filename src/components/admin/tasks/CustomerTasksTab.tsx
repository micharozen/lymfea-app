import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, ListTodo, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTasks, type Task } from "@/hooks/tasks/useTasks";
import { useOrgAdmins } from "@/hooks/tasks/useOrgAdmins";
import { TaskCardVisual } from "./TaskCard";
import { TaskDialog } from "./TaskDialog";

interface LinkedCustomer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

interface CustomerTasksTabProps {
  customer: LinkedCustomer;
}

/**
 * Onglet "Tâches" de la fiche client — pendant de {@link BookingTasksTab} : mêmes
 * tâches d'organisation, filtrées sur ce client, avec le `TaskDialog` pré-rempli.
 */
export function CustomerTasksTab({ customer }: CustomerTasksTabProps) {
  const { t } = useTranslation(["admin", "common"]);
  const { data: allTasks = [], isLoading } = useTasks();
  const { data: admins = [] } = useOrgAdmins();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const tasks = useMemo(
    () => allTasks.filter((task) => task.customer_id === customer.id),
    [allTasks, customer.id],
  );

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

  // Stable object so the dialog's seed effect doesn't re-run on every render.
  const defaultCustomer = useMemo(
    () => ({
      id: customer.id,
      first_name: customer.first_name,
      last_name: customer.last_name,
      email: customer.email ?? "",
      phone: customer.phone ?? "",
    }),
    [customer.id, customer.first_name, customer.last_name, customer.email, customer.phone],
  );

  const openNew = () => {
    setEditingTask(null);
    setDialogOpen(true);
  };

  const openTask = (task: Task) => {
    setEditingTask(task);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {t("tasks.customerTab.count", { count: tasks.length })}
        </p>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          {t("tasks.new")}
        </Button>
      </div>

      {isLoading ? (
        <div className="py-10 text-center">
          <Loader2 className="text-muted-foreground mx-auto h-5 w-5 animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
          <ListTodo className="text-muted-foreground h-8 w-8" />
          <p className="text-muted-foreground text-sm">{t("tasks.customerTab.empty")}</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {tasks.map((task) => {
            const assignee = assigneeOf(task.assigned_to_user_id);
            return (
              <TaskCardVisual
                key={task.id}
                task={task}
                assigneeName={assignee.name}
                assigneeImage={assignee.image}
                onClick={() => openTask(task)}
              />
            );
          })}
        </div>
      )}

      <TaskDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        task={editingTask}
        defaultCustomer={editingTask ? undefined : defaultCustomer}
      />
    </div>
  );
}
