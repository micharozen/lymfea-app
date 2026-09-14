import type { LucideIcon } from "lucide-react";
import { SignalLow, SignalMedium, SignalHigh, Flame } from "lucide-react";
import type { TaskStatus, TaskPriority, TaskType } from "@/hooks/tasks/useTasks";

// Visual metadata for statuses & priorities. Human labels live in i18n
// (namespace `admin`, keys tasks.status.* / tasks.priority.*).

export const TASK_STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done"];

export const PRIORITY_META: Record<
  TaskPriority,
  { badgeClass: string; dotClass: string; iconClass: string; icon: LucideIcon }
> = {
  low: {
    badgeClass: "bg-slate-100 text-slate-600 border-transparent dark:bg-slate-800 dark:text-slate-300",
    dotClass: "bg-slate-400",
    iconClass: "text-slate-500",
    icon: SignalLow,
  },
  medium: {
    badgeClass: "bg-sky-100 text-sky-700 border-transparent dark:bg-sky-950 dark:text-sky-300",
    dotClass: "bg-sky-500",
    iconClass: "text-sky-500",
    icon: SignalMedium,
  },
  high: {
    badgeClass: "bg-amber-100 text-amber-700 border-transparent dark:bg-amber-950 dark:text-amber-300",
    dotClass: "bg-amber-500",
    iconClass: "text-amber-500",
    icon: SignalHigh,
  },
  urgent: {
    badgeClass: "bg-red-100 text-red-700 border-transparent dark:bg-red-950 dark:text-red-300",
    dotClass: "bg-red-500",
    iconClass: "text-red-500",
    icon: Flame,
  },
};

export const STATUS_META: Record<TaskStatus, { badgeClass: string; dotClass: string }> = {
  todo: {
    badgeClass: "bg-slate-100 text-slate-600 border-transparent dark:bg-slate-800 dark:text-slate-300",
    dotClass: "bg-slate-400",
  },
  in_progress: {
    badgeClass: "bg-blue-100 text-blue-700 border-transparent dark:bg-blue-950 dark:text-blue-300",
    dotClass: "bg-blue-500",
  },
  done: {
    badgeClass: "bg-emerald-100 text-emerald-700 border-transparent dark:bg-emerald-950 dark:text-emerald-300",
    dotClass: "bg-emerald-500",
  },
};

export const PRIORITY_ORDER: TaskPriority[] = ["low", "medium", "high", "urgent"];

export const TASK_TYPE_ORDER: TaskType[] = [
  "booking_followup",
  "payment_followup",
  "gift_followup",
  "loyalty",
  "bug",
  "other",
];

// Couleurs du type de tâche. Volontairement utilisées dans le seul champ de
// saisie du formulaire : les cartes du board restent lisibles avec la priorité
// pour unique code couleur.
export const TASK_TYPE_META: Record<TaskType, { badgeClass: string }> = {
  booking_followup: {
    badgeClass: "bg-sky-100 text-sky-700 border-transparent dark:bg-sky-950 dark:text-sky-300",
  },
  payment_followup: {
    badgeClass:
      "bg-violet-100 text-violet-700 border-transparent dark:bg-violet-950 dark:text-violet-300",
  },
  gift_followup: {
    badgeClass: "bg-pink-100 text-pink-700 border-transparent dark:bg-pink-950 dark:text-pink-300",
  },
  loyalty: {
    badgeClass:
      "bg-emerald-100 text-emerald-700 border-transparent dark:bg-emerald-950 dark:text-emerald-300",
  },
  bug: {
    badgeClass: "bg-red-100 text-red-700 border-transparent dark:bg-red-950 dark:text-red-300",
  },
  other: {
    badgeClass:
      "bg-slate-100 text-slate-600 border-transparent dark:bg-slate-800 dark:text-slate-300",
  },
};

// Higher weight = more urgent, used to sort cards within a column.
export const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  urgent: 3,
  high: 2,
  medium: 1,
  low: 0,
};
