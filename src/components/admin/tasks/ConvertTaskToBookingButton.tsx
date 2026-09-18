import { lazy, Suspense, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarPlus, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { splitPhoneNumber } from "@/lib/phone";
import { channelToBookingSource } from "@/lib/taskChannel";
import { useTaskMutations } from "@/hooks/tasks/useTaskMutations";
import type { Task, TaskChannel, TaskPriority, TaskStatus, TaskType } from "@/hooks/tasks/useTasks";
import type {
  BookingModalInitialValues,
  CreatedBookingInfo,
} from "@/components/booking/BookingModal";

const BookingModal = lazy(() =>
  import("@/components/booking/BookingModal").then((m) => ({ default: m.default })),
);

interface Props {
  task: Task;
  /** Appelé après conversion pour rafraîchir/fermer le dialog parent. */
  onConverted?: (booking: CreatedBookingInfo) => void;
}

/**
 * Transforme une demande entrante en réservation.
 *
 * Aucun moteur de réservation n'est réimplémenté ici : on ouvre le tunnel
 * admin habituel (`BookingModal`) pré-rempli avec ce que la tâche sait déjà.
 * C'est lui qui résout ou crée la fiche client (`find_or_create_customer`,
 * qui dédoublonne par téléphone puis email) et qui déclenche les
 * notifications — donc la confirmation client part par le circuit normal,
 * jamais depuis la tâche.
 */
export function ConvertTaskToBookingButton({ task, onConverted }: Props) {
  const { t } = useTranslation("admin");
  const { update } = useTaskMutations();
  const [open, setOpen] = useState(false);
  // Conservée jusqu'à la fermeture : la conversion est acquise dès la création,
  // mais on ne prévient le parent qu'une fois la modale (et son étape d'envoi
  // de la communication) réellement quittée.
  const convertedRef = useRef<CreatedBookingInfo | null>(null);

  // Déjà convertie : la conversion n'est pas rejouable, on renvoie vers la résa.
  if (task.converted_booking_id) {
    return (
      <Button variant="outline" size="sm" asChild>
        <a
          href={`/admin/bookings/${task.converted_booking_id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          {t("tasks.alreadyConverted")}
        </a>
      </Button>
    );
  }

  const initialValues = buildInitialValues(task);

  const handleCreated = async (booking: CreatedBookingInfo) => {
    try {
      await update.mutateAsync({
        id: task.id,
        previousAssignee: task.assigned_to_user_id,
        title: task.title,
        description: task.description,
        priority: task.priority as TaskPriority,
        status: "done",
        task_type: task.task_type as TaskType,
        task_type_other: task.task_type_other,
        treatment_menu_ids: task.treatment_menu_ids ?? [],
        therapist_ids: task.therapist_ids ?? [],
        checklist: task.checklist ?? [],
        attachments: task.attachments ?? [],
        due_date: task.due_date,
        hotel_id: task.hotel_id,
        customer_id: task.customer_id,
        assigned_to_user_id: task.assigned_to_user_id,
        channel: task.channel,
        feedback_type: task.feedback_type,
        client_type: task.client_type,
        treatment_date: task.treatment_date,
        prospect_first_name: task.prospect_first_name,
        prospect_last_name: task.prospect_last_name,
        prospect_email: task.prospect_email,
        prospect_phone: task.prospect_phone,
        booking_id: booking.id,
        converted_booking_id: booking.id,
      });
      toast.success(t("tasks.convertSuccess", { number: booking.booking_id }));
      convertedRef.current = booking;
    } catch (error) {
      // La réservation existe : on ne doit pas laisser croire le contraire.
      toast.error(
        t("tasks.convertLinkError", {
          number: booking.booking_id,
          defaultValue: error instanceof Error ? error.message : "",
        }),
      );
    }
  };

  // La réservation créée, `BookingModal` reste ouverte sur son étape finale pour
  // que l'envoi de la communication soit une action distincte et facultative.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) return;
    const booking = convertedRef.current;
    convertedRef.current = null;
    if (booking) onConverted?.(booking);
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <CalendarPlus className="mr-2 h-4 w-4" />
        {t("tasks.convertToBooking")}
      </Button>
      {open && (
        <Suspense fallback={null}>
          <BookingModal
            open={open}
            onOpenChange={handleOpenChange}
            initialValues={initialValues}
            source={channelToBookingSource(task.channel as TaskChannel | null)}
            onCreated={handleCreated}
          />
        </Suspense>
      )}
    </>
  );
}

/**
 * Traduit la tâche en valeurs initiales du tunnel de réservation.
 *
 * L'identité vient du client lié quand il existe, sinon des champs prospect —
 * ces derniers n'ayant justement aucune fiche en base à ce stade.
 */
function buildInitialValues(task: Task): BookingModalInitialValues {
  const { countryCode, phone } = splitPhoneNumber(task.prospect_phone ?? "");
  const firstName = task.customer?.first_name ?? task.prospect_first_name ?? undefined;
  const lastName = task.customer?.last_name ?? task.prospect_last_name ?? undefined;
  const date = task.treatment_date ? new Date(`${task.treatment_date}T00:00:00`) : undefined;

  return {
    hotelId: task.hotel_id ?? undefined,
    treatmentId: task.treatment_menu_ids?.[0] ?? undefined,
    clientFirstName: firstName || undefined,
    clientLastName: lastName || undefined,
    clientEmail: task.prospect_email ?? undefined,
    phone: phone || undefined,
    countryCode,
    date: date && !Number.isNaN(date.getTime()) ? date : undefined,
    clientNote: task.description ?? undefined,
  };
}
