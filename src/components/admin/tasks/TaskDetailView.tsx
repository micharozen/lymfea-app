import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ExternalLink, Search, Trash2, User, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { listHotelsForOrgDropdown, hotelKeys } from "@shared/db";
import { useQuery } from "@tanstack/react-query";
import { useOrgScope } from "@/hooks/useOrgScope";
import { useVenueTreatmentMenus } from "@/hooks/useVenueTreatmentMenus";
import { useTaskMutations } from "@/hooks/tasks/useTaskMutations";
import { useOrgAdmins } from "@/hooks/tasks/useOrgAdmins";
import { useTaskMessages, rootMessageOf } from "@/hooks/tasks/useTaskMessages";
import type { Task, TaskChannel, TaskType } from "@/hooks/tasks/useTasks";
import { BOOKING_CLIENT_TYPES, CLIENT_TYPE_META, type BookingClientType } from "@/lib/clientTypeMeta";
import { InquiryThreadView } from "@/components/admin/inbox/InquiryThreadView";
import {
  PRIORITY_META,
  PRIORITY_ORDER,
  STATUS_META,
  TASK_CHANNEL_META,
  TASK_CHANNEL_ORDER,
  TASK_FEEDBACK_TYPE_ORDER,
  TASK_STATUS_ORDER,
  TASK_TYPE_META,
  TASK_TYPE_ORDER,
  TASK_TYPES_REQUIRING_BOOKING,
} from "./taskConstants";
import { InlineDate, InlineSelect, InlineText } from "./InlineField";
import { TaskChecklist } from "./TaskChecklist";
import { TaskAttachments } from "./TaskAttachments";
import { TaskComments } from "./TaskComments";
import { GlobalSearch } from "@/components/admin/GlobalSearch";
import { fetchBookingById, formatBookingLabel } from "@/lib/bookingSearch";
import { bookingContextPatch, type BookingContextPatch } from "./bookingContext";
import { ConvertTaskToBookingButton } from "./ConvertTaskToBookingButton";

interface Props {
  task: Task;
  onClose: () => void;
  onDelete: () => void;
}

/** Valeur non modifiable, issue de la réservation liée. */
function ReadOnlyValue({ children }: { children: React.ReactNode }) {
  return <div className="py-1 text-sm">{children}</div>;
}

/** Ligne « libellé / valeur » du panneau de droite. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-start gap-2 py-1">
      <span className="text-muted-foreground pt-1 text-xs">{label}</span>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Vue d'une tâche existante : on la lit, et chaque champ s'édite sur place.
 *
 * Le suivi (statut, priorité, assigné, échéance) occupe l'en-tête, le contenu
 * la colonne de gauche, et le contexte métier le panneau de droite. La création
 * reste un formulaire classique — il n'y a rien à lire tant que rien n'existe.
 */
export function TaskDetailView({ task, onClose, onDelete }: Props) {
  const { t, i18n } = useTranslation("admin");
  const scope = useOrgScope();
  const { patch, remove } = useTaskMutations();
  const { data: admins = [] } = useOrgAdmins();
  const { data: messages } = useTaskMessages(task.id);
  // Palette de recherche ouverte pour rattacher une réservation ou un client.
  const [picker, setPicker] = useState<"booking" | "customer" | null>(null);
  const rootMessage = rootMessageOf(messages);

  const { data: hotels = [] } = useQuery({
    queryKey: hotelKeys.dropdown(scope),
    enabled: !!scope,
    queryFn: () => listHotelsForOrgDropdown(supabase, scope!),
  });
  const { data: treatments = [] } = useVenueTreatmentMenus(task.hotel_id);

  const save = (fields: Partial<Record<string, unknown>> | BookingContextPatch) => {
    patch.mutate(
      { id: task.id, ...fields },
      { onError: (error) => toast.error(error instanceof Error ? error.message : t("tasks.saveError")) },
    );
  };

  // Sur une tâche adossée à une réservation, ce qui vient d'elle se lit mais ne
  // s'édite pas : deux valeurs concurrentes pour le même fait n'auraient aucun
  // sens, et la réservation fait foi.
  const derivedFromBooking =
    TASK_TYPES_REQUIRING_BOOKING.includes(task.task_type as TaskType) && Boolean(task.booking_id);

  const assignee = admins.find((admin) => admin.user_id === task.assigned_to_user_id);
  const assigneeName = assignee ? `${assignee.first_name} ${assignee.last_name}`.trim() : null;
  const overdue =
    task.due_date != null &&
    task.status !== "done" &&
    new Date(task.due_date).setHours(23, 59, 59, 999) < Date.now();

  const treatmentLabel = (treatment: { name: string; name_en: string | null }) =>
    i18n.language.startsWith("en") ? (treatment.name_en ?? treatment.name) : treatment.name;
  const formatDate = (value: string) =>
    new Date(`${value}T00:00:00`).toLocaleDateString(i18n.language.startsWith("en") ? "en-GB" : "fr-FR");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* En-tête : identité de la demande + suivi */}
      <div className="shrink-0 border-b px-6 pt-4 pb-3">
        <div className="mb-1 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
        {task.booking && (
          <a
            href={`/admin/bookings/${task.booking.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
          >
            {formatBookingLabel({
              id: task.booking.id,
              booking_id: task.booking.booking_id,
              booking_date: task.booking.booking_date,
              hotel_id: null,
              client_type: null,
              client_first_name: task.booking.client_first_name,
              client_last_name: task.booking.client_last_name,
              booking_treatments: null,
              booking_therapists: null,
              customer: null,
            })}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}

        <InlineText
          value={task.title}
          onSave={(value) => value && save({ title: value })}
          placeholder={t("tasks.fields.title")}
          className="text-lg font-medium"
        />
          </div>
          {/* Action principale de la tâche : bien visible, pas enfouie sous le
              contexte. `mr-8` laisse la place à la croix de fermeture. */}
          <div className="mr-8 shrink-0">
            <ConvertTaskToBookingButton task={task} onConverted={onClose} />
          </div>
        </div>

        <div className="mt-1.5 flex flex-wrap items-start gap-x-6 gap-y-1">
          <div className="w-[150px]">
            <p className="text-muted-foreground text-[11px] leading-tight">{t("tasks.fields.status")}</p>
            <InlineSelect
              value={task.status}
              clearable={false}
              options={TASK_STATUS_ORDER.map((value) => ({
                value,
                label: t(`tasks.status.${value}`),
              }))}
              onSave={(value) => value && save({ status: value })}
              placeholder={t("tasks.fields.status")}
              renderValue={(option) => (
                <Badge
                  className={cn("font-normal", STATUS_META[task.status as keyof typeof STATUS_META]?.badgeClass)}
                >
                  {option?.label ?? task.status}
                </Badge>
              )}
            />
          </div>
          <div className="w-[150px]">
            <p className="text-muted-foreground text-[11px] leading-tight">{t("tasks.fields.priority")}</p>
            <InlineSelect
              value={task.priority}
              clearable={false}
              options={PRIORITY_ORDER.map((value) => ({
                value,
                label: t(`tasks.priority.${value}`),
              }))}
              onSave={(value) => value && save({ priority: value })}
              placeholder={t("tasks.fields.priority")}
              renderValue={(option) => {
                const meta = PRIORITY_META[task.priority as keyof typeof PRIORITY_META];
                const Icon = meta?.icon;
                return (
                  <Badge className={cn("gap-1 font-normal", meta?.badgeClass)}>
                    {Icon && <Icon className="h-3 w-3" />}
                    {option?.label ?? task.priority}
                  </Badge>
                );
              }}
            />
          </div>
          <div className="w-[190px]">
            <p className="text-muted-foreground text-[11px] leading-tight">{t("tasks.fields.assignee")}</p>
            <InlineSelect
              value={task.assigned_to_user_id}
              options={admins.map((admin) => ({
                value: admin.user_id,
                label: `${admin.first_name} ${admin.last_name}`.trim(),
              }))}
              onSave={(value) => save({ assigned_to_user_id: value })}
              placeholder={t("tasks.fields.noAssignee")}
              renderValue={() =>
                assigneeName ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Avatar className="h-5 w-5">
                      {assignee?.profile_image && (
                        <AvatarImage src={assignee.profile_image} alt={assigneeName} />
                      )}
                      <AvatarFallback className="text-[9px]">{initials(assigneeName)}</AvatarFallback>
                    </Avatar>
                    {assigneeName}
                  </span>
                ) : (
                  t("tasks.fields.noAssignee")
                )
              }
            />
          </div>
          <div className="w-[150px]">
            <p className="text-muted-foreground text-[11px] leading-tight">{t("tasks.fields.dueDate")}</p>
            <InlineDate
              value={task.due_date}
              onSave={(value) => save({ due_date: value })}
              placeholder={t("tasks.fields.noDueDate")}
              renderValue={(value) => (
                <span className={cn(overdue && "font-medium text-red-600")}>{formatDate(value)}</span>
              )}
            />
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-6 py-3 lg:grid-cols-[1fr_290px]">
        {/* Colonne gauche — le contenu du travail */}
        <div className="min-w-0 space-y-4">
          <section>
            <h3 className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase">
              {t("tasks.fields.description")}
            </h3>
            <InlineText
              value={task.description}
              onSave={(value) => save({ description: value })}
              placeholder={t("tasks.fields.noDescription")}
              multiline
              className="text-sm whitespace-pre-wrap"
            />
          </section>

          <section>
            <h3 className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase">
              {t("tasks.fields.checklist")}
            </h3>
            <TaskChecklist
              value={task.checklist ?? []}
              onChange={(checklist) => save({ checklist })}
            />
          </section>

          <section>
            <h3 className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase">
              {t("tasks.fields.attachments")}
            </h3>
            <TaskAttachments
              value={task.attachments ?? []}
              onChange={(attachments) => save({ attachments })}
            />
          </section>

          <section>
            <h3 className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase">
              {t("tasks.comments.title")}
            </h3>
            <TaskComments taskId={task.id} taskTitle={task.title} />
          </section>

          {rootMessage && (
            <section>
              <h3 className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase">
                {t("tasks.messages.title")}
              </h3>
              <InquiryThreadView rootInquiryId={rootMessage.id} />
            </section>
          )}
        </div>

        {/* Colonne droite — le contexte métier de la demande */}
        <aside className="min-w-0">
          <div className="bg-muted/30 rounded-lg border p-3">
            <h3 className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase">
              {t("tasks.fields.context")}
            </h3>

            {/* Sur une demande entrante, le prospect est souvent la seule
                identité connue : il se lit avant le reste du contexte. */}
            {!task.customer &&
              (task.prospect_first_name || task.prospect_last_name || task.prospect_phone) && (
                <>
                  <Row label={t("tasks.fields.prospect")}>
                    <div className="space-y-0.5 text-sm">
                      <p className="font-medium">
                        {`${task.prospect_first_name ?? ""} ${task.prospect_last_name ?? ""}`.trim()}
                      </p>
                      {task.prospect_email && (
                        <p className="text-muted-foreground text-xs break-all">
                          {task.prospect_email}
                        </p>
                      )}
                      {task.prospect_phone && (
                        <p className="text-muted-foreground text-xs">{task.prospect_phone}</p>
                      )}
                    </div>
                  </Row>
                  <Separator className="my-2" />
                </>
              )}

            <Row label={t("tasks.fields.taskType")}>
              <InlineSelect
                value={task.task_type}
                clearable={false}
                options={TASK_TYPE_ORDER.map((value) => ({
                  value,
                  label: t(`tasks.type.${value}`),
                }))}
                onSave={(value) => value && save({ task_type: value })}
                placeholder={t("tasks.fields.taskType")}
                renderValue={(option) => (
                  <Badge
                    className={cn(
                      "font-normal whitespace-nowrap",
                      TASK_TYPE_META[task.task_type as keyof typeof TASK_TYPE_META]?.badgeClass,
                    )}
                  >
                    {option?.label ?? task.task_type}
                  </Badge>
                )}
              />
            </Row>

            <Row label={t("tasks.fields.channel")}>
              <InlineSelect
                value={task.channel}
                options={TASK_CHANNEL_ORDER.map((channel) => {
                  const Icon = TASK_CHANNEL_META[channel].icon;
                  return {
                    value: channel,
                    label: t(`tasks.channel.${channel}`),
                    icon: <Icon className="h-4 w-4" />,
                  };
                })}
                onSave={(value) => save({ channel: value })}
                placeholder={t("tasks.fields.noChannel")}
                renderValue={() => {
                  if (!task.channel) return t("tasks.fields.noChannel");
                  const meta = TASK_CHANNEL_META[task.channel as TaskChannel];
                  const Icon = meta?.icon;
                  return (
                    <span className="inline-flex items-center gap-1.5">
                      {Icon && <Icon className="h-3.5 w-3.5" />}
                      {t(`tasks.channel.${task.channel}`, { defaultValue: task.channel })}
                    </span>
                  );
                }}
              />
            </Row>

            <Row label={t("tasks.fields.feedbackType")}>
              <InlineSelect
                value={task.feedback_type}
                options={TASK_FEEDBACK_TYPE_ORDER.map((value) => ({
                  value,
                  label: t(`tasks.feedbackType.${value}`),
                }))}
                onSave={(value) => save({ feedback_type: value })}
                placeholder={t("tasks.fields.noFeedbackType")}
              />
            </Row>

            <Row label={t("tasks.fields.venue")}>
              {derivedFromBooking ? (
                <ReadOnlyValue>
                  {hotels.find((hotel) => hotel.id === task.hotel_id)?.name ?? "—"}
                </ReadOnlyValue>
              ) : (
              <InlineSelect
                value={task.hotel_id}
                clearable={false}
                options={hotels.map((hotel) => ({ value: hotel.id, label: hotel.name }))}
                // Changer de lieu invalide les soins et thérapeutes du lieu précédent.
                onSave={(value) =>
                  value && save({ hotel_id: value, treatment_menu_ids: [], therapist_ids: [] })
                }
                placeholder={t("tasks.fields.selectVenue")}
              />
              )}
            </Row>

            <Row label={t("tasks.fields.treatmentDate")}>
              {derivedFromBooking ? (
                <ReadOnlyValue>
                  {task.treatment_date ? formatDate(task.treatment_date) : "—"}
                </ReadOnlyValue>
              ) : (
              <InlineDate
                value={task.treatment_date}
                onSave={(value) => save({ treatment_date: value })}
                placeholder={t("tasks.fields.noTreatmentDate")}
                renderValue={formatDate}
              />
              )}
            </Row>

            <Row label={t("tasks.fields.clientType")}>
              {derivedFromBooking ? (
                <ReadOnlyValue>
                  {task.client_type
                    ? t(CLIENT_TYPE_META[task.client_type as BookingClientType]?.labelKey ?? "")
                    : "—"}
                </ReadOnlyValue>
              ) : (
              <InlineSelect
                value={task.client_type}
                options={BOOKING_CLIENT_TYPES.map((value) => ({
                  value,
                  label: t(CLIENT_TYPE_META[value].labelKey),
                }))}
                onSave={(value) => save({ client_type: value })}
                placeholder={t("tasks.fields.noClientType")}
              />
              )}
            </Row>

            <Row label={t("tasks.fields.treatments")}>
              {(task.treatment_menu_ids ?? []).length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {(task.treatment_menu_ids ?? []).map((id) => {
                    const treatment = treatments.find((item) => item.id === id);
                    return (
                      <span key={id} className="bg-muted rounded px-1.5 py-0.5 text-xs">
                        {treatment ? treatmentLabel(treatment) : "—"}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <span className="text-muted-foreground text-sm italic">
                  {t("tasks.fields.noTreatment")}
                </span>
              )}
            </Row>

            <Separator className="my-2" />

            <Row label={t("tasks.fields.linkedBooking")}>
              {task.booking ? (
                <div className="flex min-w-0 items-center gap-1">
                  <a
                    href={`/admin/bookings/${task.booking.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary min-w-0 truncate text-sm hover:underline"
                  >
                    {`#${task.booking.booking_id ?? "?"} · ${`${task.booking.client_first_name ?? ""} ${task.booking.client_last_name ?? ""}`.trim()}`}
                  </a>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => save({ booking_id: null })}
                    aria-label={t("tasks.fields.noBooking")}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-full min-w-0 justify-start font-normal"
                  onClick={() => setPicker("booking")}
                >
                  <Search className="mr-2 h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{t("tasks.fields.linkBooking")}</span>
                </Button>
              )}
            </Row>

            <Row label={t("tasks.fields.linkedCustomer")}>
              {task.customer ? (
                <a
                  href={`/admin/customers/${task.customer.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
                >
                  <User className="h-3 w-3" />
                  {`${task.customer.first_name ?? ""} ${task.customer.last_name ?? ""}`.trim()}
                </a>
              ) : derivedFromBooking ? (
                // Le client découle de la réservation : on ne propose pas d'en
                // choisir un autre, qui contredirait la réservation liée.
                <ReadOnlyValue>—</ReadOnlyValue>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-full min-w-0 justify-start font-normal"
                  onClick={() => setPicker("customer")}
                >
                  <Search className="mr-2 h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{t("tasks.fields.linkCustomer")}</span>
                </Button>
              )}
            </Row>

          </div>
        </aside>
      </div>

      {picker && (
        <GlobalSearch
          open
          onOpenChange={(next) => !next && setPicker(null)}
          onPickBooking={
            picker === "booking"
              ? async (picked) => {
                  setPicker(null);
                  // La recherche globale ne renvoie qu'une identité : on
                  // recharge la réservation pour en reprendre tout le contexte.
                  try {
                    const full = await fetchBookingById(picked.id);
                    save(full ? bookingContextPatch(full) : { booking_id: picked.id });
                  } catch {
                    save({ booking_id: picked.id });
                  }
                }
              : undefined
          }
          onPickCustomer={
            picker === "customer"
              ? (customer) => {
                  save({ customer_id: customer.id });
                  setPicker(null);
                }
              : undefined
          }
        />
      )}

      <div className="flex shrink-0 items-center justify-between gap-2 border-t px-6 py-3">
        <Button
          type="button"
          variant="ghost"
          className="text-red-600 hover:text-red-700"
          onClick={onDelete}
          disabled={remove.isPending}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t("common.delete")}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          {t("common.close")}
        </Button>
      </div>
    </div>
  );
}
