import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO, isBefore, startOfDay } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { Plus, Palmtree, Thermometer, MoreHorizontal, Trash2, CalendarOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { CreateAbsenceDrawer } from "./CreateAbsenceDrawer";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface Absence {
  id: string;
  start_date: string;
  end_date: string;
  reason: string;
  note: string | null;
  created_at: string;
}

interface AbsencesListProps {
  therapistId: string;
  onAbsenceChanged?: () => void;
}

const reasonConfig = {
  vacation: { icon: Palmtree, bgClass: "bg-blue-100 dark:bg-blue-900/30", textClass: "text-blue-700 dark:text-blue-300", dotClass: "bg-blue-500" },
  sick: { icon: Thermometer, bgClass: "bg-orange-100 dark:bg-orange-900/30", textClass: "text-orange-700 dark:text-orange-300", dotClass: "bg-orange-500" },
  other: { icon: MoreHorizontal, bgClass: "bg-gray-100 dark:bg-gray-800", textClass: "text-gray-700 dark:text-gray-300", dotClass: "bg-gray-500" },
};

export function AbsencesList({ therapistId, onAbsenceChanged }: AbsencesListProps) {
  const { t, i18n } = useTranslation("pwa");
  const locale = i18n.language === "fr" ? fr : enUS;
  const queryClient = useQueryClient();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: absences = [], isLoading } = useQuery({
    queryKey: ["therapist-absences", therapistId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("therapist_absences")
        .select("*")
        .eq("therapist_id", therapistId)
        .order("start_date", { ascending: false });

      if (error) throw error;
      return (data || []) as Absence[];
    },
    enabled: !!therapistId,
  });

  const handleCreate = useCallback(async (
    startDate: string,
    endDate: string,
    reason: string,
    note: string
  ) => {
    setSaving(true);
    const { error } = await supabase.rpc("create_therapist_absence", {
      _therapist_id: therapistId,
      _start_date: startDate,
      _end_date: endDate,
      _reason: reason,
      _note: note || undefined,
    });
    setSaving(false);

    if (error) {
      console.error("Error creating absence:", error);
      toast.error(t("common:errors.generic"));
      return;
    }

    toast.success(t("schedule.absenceCreated"));
    setDrawerOpen(false);
    queryClient.invalidateQueries({ queryKey: ["therapist-absences", therapistId] });
    onAbsenceChanged?.();
  }, [therapistId, t, queryClient, onAbsenceChanged]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    const { error } = await supabase.rpc("delete_therapist_absence", {
      _absence_id: deleteTarget,
    });
    setDeleting(false);

    if (error) {
      console.error("Error deleting absence:", error);
      toast.error(t("common:errors.generic"));
      return;
    }

    toast.success(t("schedule.absenceDeleted"));
    setDeleteTarget(null);
    queryClient.invalidateQueries({ queryKey: ["therapist-absences", therapistId] });
    onAbsenceChanged?.();
  }, [deleteTarget, therapistId, t, queryClient, onAbsenceChanged]);

  const today = startOfDay(new Date());
  const upcoming = absences.filter(a => !isBefore(parseISO(a.end_date), today));
  const past = absences.filter(a => isBefore(parseISO(a.end_date), today));

  const reasonLabel = (reason: string) => {
    switch (reason) {
      case "vacation": return t("schedule.absenceVacation");
      case "sick": return t("schedule.absenceSick");
      default: return t("schedule.absenceOther");
    }
  };

  const formatDateRange = (start: string, end: string) => {
    const s = parseISO(start);
    const e = parseISO(end);
    if (start === end) {
      return format(s, "d MMM yyyy", { locale });
    }
    return `${format(s, "d MMM", { locale })} → ${format(e, "d MMM yyyy", { locale })}`;
  };

  const renderAbsenceCard = (absence: Absence, isPast: boolean) => {
    const config = reasonConfig[absence.reason as keyof typeof reasonConfig] || reasonConfig.other;
    const Icon = config.icon;

    return (
      <div
        key={absence.id}
        className={cn(
          "flex items-center gap-3 rounded-xl p-3 transition-colors",
          config.bgClass,
          isPast && "opacity-60"
        )}
      >
        <div className={cn("flex-shrink-0 rounded-full p-2", config.bgClass)}>
          <Icon className={cn("h-4 w-4", config.textClass)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-medium", config.textClass)}>
            {reasonLabel(absence.reason)}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDateRange(absence.start_date, absence.end_date)}
          </p>
          {absence.note && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {absence.note}
            </p>
          )}
        </div>
        {!isPast && (
          <button
            onClick={() => setDeleteTarget(absence.id)}
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-background/50 transition-colors"
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => (
          <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add button */}
      <Button
        onClick={() => setDrawerOpen(true)}
        className="w-full"
        variant="outline"
      >
        <Plus className="h-4 w-4 mr-2" />
        {t("schedule.addAbsence")}
      </Button>

      {/* Empty state */}
      {absences.length === 0 && (
        <div className="text-center py-8 space-y-2">
          <CalendarOff className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">{t("schedule.noAbsences")}</p>
          <p className="text-xs text-muted-foreground">{t("schedule.noAbsencesDesc")}</p>
        </div>
      )}

      {/* Upcoming absences */}
      {upcoming.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t("schedule.upcoming")}
          </h3>
          {upcoming.map(a => renderAbsenceCard(a, false))}
        </div>
      )}

      {/* Past absences */}
      {past.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t("schedule.past")}
          </h3>
          {past.map(a => renderAbsenceCard(a, true))}
        </div>
      )}

      {/* Create drawer */}
      <CreateAbsenceDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onSave={handleCreate}
        saving={saving}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("schedule.deleteAbsenceTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("schedule.deleteAbsenceDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("common:cancel", "Annuler")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "..." : t("schedule.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
