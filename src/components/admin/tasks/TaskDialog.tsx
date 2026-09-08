import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Trash2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  searchCustomers,
  listHotelsForOrgDropdown,
  listActiveTherapistsForHotel,
  hotelKeys,
  therapistKeys,
  type CustomerSearchResult,
  type TaskChecklistItem,
} from "@shared/db";
import { useOrgScope } from "@/hooks/useOrgScope";
import { useVenueTreatmentMenus } from "@/hooks/useVenueTreatmentMenus";
import { useUser } from "@/contexts/UserContext";
import { useTaskMutations } from "@/hooks/tasks/useTaskMutations";
import { useOrgAdmins } from "@/hooks/tasks/useOrgAdmins";
import type { Task, TaskPriority, TaskStatus, TaskType } from "@/hooks/tasks/useTasks";
import {
  PRIORITY_META,
  PRIORITY_ORDER,
  STATUS_META,
  TASK_STATUS_ORDER,
  TASK_TYPE_META,
  TASK_TYPE_ORDER,
} from "./taskConstants";
import { EntitySearchCombobox } from "./EntitySearchCombobox";
import { TaskChecklist } from "./TaskChecklist";
import { TaskAttachments } from "./TaskAttachments";
import { SelectField } from "@/components/ui/select-field";
import { MultiSelectField } from "@/components/ui/multi-select-field";
import { searchBookings, type BookingSearchResult } from "@/lib/bookingSearch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const formSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    task_type: z.enum([
      "booking_followup",
      "payment_followup",
      "gift_followup",
      "loyalty",
      "bug",
      "other",
    ]),
    task_type_other: z.string().optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    status: z.enum(["todo", "in_progress", "done"]),
    due_date: z.string().min(1),
    assigned_to_user_id: z.string().min(1),
    hotel_id: z.string().min(1),
  })
  // Le libellé libre n'est exigé que sur le type « Autre ».
  .superRefine((values, ctx) => {
    if (values.task_type === "other" && !values.task_type_other?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["task_type_other"],
        message: "required",
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

interface TaskDialogProps {
  open: boolean;
  onClose: () => void;
  task: Task | null;
  defaultStatus?: TaskStatus;
  /** Pré-remplit la réservation liée pour une nouvelle tâche (onglet Tâches d'une résa). */
  defaultBooking?: BookingSearchResult | null;
  /** Pré-remplit le client lié pour une nouvelle tâche (onglet Tâches d'une fiche client). */
  defaultCustomer?: CustomerSearchResult | null;
}

// Local date (yyyy-mm-dd) offset by `days`, for the due-date quick presets.
function isoDatePlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

const DUE_DATE_PRESETS: { key: string; days: number }[] = [
  { key: "today", days: 0 },
  { key: "tomorrow", days: 1 },
  { key: "in3days", days: 3 },
  { key: "in7days", days: 7 },
];

// Red asterisk marking a required field.
function Req() {
  return <span className="ml-0.5 text-red-500">*</span>;
}

export function TaskDialog({
  open,
  onClose,
  task,
  defaultStatus,
  defaultBooking,
  defaultCustomer,
}: TaskDialogProps) {
  const { t, i18n } = useTranslation("admin");
  const { userId } = useUser();
  const scope = useOrgScope();
  const { create, update, remove } = useTaskMutations();
  const { data: admins = [] } = useOrgAdmins();

  const [booking, setBooking] = useState<BookingSearchResult | null>(null);
  const [customer, setCustomer] = useState<CustomerSearchResult | null>(null);
  const [treatmentIds, setTreatmentIds] = useState<string[]>([]);
  const [therapistIds, setTherapistIds] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<TaskChecklistItem[]>([]);
  const [attachments, setAttachments] = useState<string[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      task_type: "booking_followup",
      task_type_other: "",
      priority: "medium",
      status: defaultStatus ?? "todo",
      due_date: "",
      assigned_to_user_id: userId ?? "",
      hotel_id: "",
    },
  });

  const taskType = form.watch("task_type");
  const hotelId = form.watch("hotel_id");

  const { data: hotels = [] } = useQuery({
    queryKey: hotelKeys.dropdown(scope),
    enabled: open && !!scope,
    queryFn: () => listHotelsForOrgDropdown(supabase, scope!),
  });

  const { data: treatments = [] } = useVenueTreatmentMenus(open && hotelId ? hotelId : null);

  const { data: therapists = [] } = useQuery({
    queryKey: therapistKeys.forHotel(hotelId),
    enabled: open && !!hotelId,
    queryFn: () => listActiveTherapistsForHotel(supabase, hotelId),
  });

  // Seed the form whenever the dialog opens for a new/edited task.
  useEffect(() => {
    if (!open) return;
    if (task) {
      form.reset({
        title: task.title,
        description: task.description ?? "",
        task_type: task.task_type as TaskType,
        task_type_other: task.task_type_other ?? "",
        priority: task.priority as TaskPriority,
        status: task.status as TaskStatus,
        due_date: task.due_date ?? "",
        assigned_to_user_id: task.assigned_to_user_id ?? userId ?? "",
        hotel_id: task.hotel_id ?? "",
      });
      setTreatmentIds(task.treatment_menu_ids ?? []);
      setTherapistIds(task.therapist_ids ?? []);
      setChecklist(task.checklist ?? []);
      setAttachments(task.attachments ?? []);
      setBooking(
        task.booking
          ? {
              id: task.booking.id,
              booking_id: task.booking.booking_id,
              client_first_name: task.booking.client_first_name,
              client_last_name: task.booking.client_last_name,
              customer: null,
            }
          : null,
      );
      setCustomer(
        task.customer
          ? {
              id: task.customer.id,
              first_name: task.customer.first_name,
              last_name: task.customer.last_name,
              phone: "",
              email: "",
            }
          : null,
      );
    } else {
      form.reset({
        title: "",
        description: "",
        task_type: "booking_followup",
        task_type_other: "",
        priority: "medium",
        status: defaultStatus ?? "todo",
        due_date: "",
        assigned_to_user_id: userId ?? "",
        hotel_id: "",
      });
      setTreatmentIds([]);
      setTherapistIds([]);
      setChecklist([]);
      setAttachments([]);
      setBooking(defaultBooking ?? null);
      setCustomer(defaultCustomer ?? null);
    }
  }, [open, task, defaultStatus, userId, form, defaultBooking, defaultCustomer]);

  const onSubmit = async (values: FormValues) => {
    const shared = {
      title: values.title,
      description: values.description || null,
      task_type: values.task_type,
      task_type_other: values.task_type === "other" ? values.task_type_other?.trim() || null : null,
      priority: values.priority,
      status: values.status,
      due_date: values.due_date,
      hotel_id: values.hotel_id,
      treatment_menu_ids: treatmentIds,
      therapist_ids: therapistIds,
      checklist: checklist.filter((item) => item.label.trim() !== ""),
      attachments,
      booking_id: booking?.id ?? null,
      customer_id: customer?.id ?? null,
      assigned_to_user_id: values.assigned_to_user_id,
    };
    try {
      if (task) {
        await update.mutateAsync({
          id: task.id,
          previousAssignee: task.assigned_to_user_id,
          ...shared,
        });
        toast.success(t("tasks.updateSuccess"));
      } else {
        await create.mutateAsync(shared);
        toast.success(t("tasks.createSuccess"));
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("tasks.saveError"));
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    try {
      await remove.mutateAsync(task.id);
      toast.success(t("tasks.deleteSuccess"));
      onClose();
    } catch {
      toast.error(t("tasks.saveError"));
    }
  };

  // Selecting a booking auto-fills the linked customer from that booking (when
  // it has one) so the two links stay consistent.
  const handleBookingChange = (b: BookingSearchResult | null) => {
    setBooking(b);
    if (b?.customer) {
      setCustomer({
        id: b.customer.id,
        first_name: b.customer.first_name,
        last_name: b.customer.last_name,
        phone: b.customer.phone ?? "",
        email: b.customer.email ?? "",
      });
    }
  };

  // Changer de lieu change les soins et thérapeutes disponibles : les sélections
  // faites pour le lieu précédent n'ont plus de sens.
  const handleHotelChange = (nextHotelId: string) => {
    if (nextHotelId === hotelId) return;
    form.setValue("hotel_id", nextHotelId, { shouldValidate: true });
    setTreatmentIds([]);
    setTherapistIds([]);
  };

  const treatmentLabel = (treatment: { name: string; name_en: string | null }) =>
    i18n.language.startsWith("en") ? (treatment.name_en ?? treatment.name) : treatment.name;

  const saving = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle className="font-normal">
            {task ? t("tasks.editTitle") : t("tasks.newTitle")}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto px-6 py-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>
                      {t("tasks.fields.title")}
                      <Req />
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t("tasks.fields.titlePlaceholder")} autoFocus />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>{t("tasks.fields.description")}</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} placeholder={t("tasks.fields.descriptionPlaceholder")} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="task_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("tasks.fields.taskType")}
                      <Req />
                    </FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TASK_TYPE_ORDER.map((type) => (
                          <SelectItem key={type} value={type}>
                            <Badge className={cn("font-medium", TASK_TYPE_META[type].badgeClass)}>
                              {t(`tasks.type.${type}`)}
                            </Badge>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {taskType === "other" && (
                <FormField
                  control={form.control}
                  name="task_type_other"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("tasks.fields.taskTypeOther")}
                        <Req />
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={t("tasks.fields.taskTypeOtherPlaceholder")}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("tasks.fields.priority")}
                      <Req />
                    </FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PRIORITY_ORDER.map((p) => {
                          const meta = PRIORITY_META[p];
                          const Icon = meta.icon;
                          return (
                            <SelectItem key={p} value={p}>
                              <span className="flex items-center gap-2">
                                <Icon className={cn("h-4 w-4", meta.iconClass)} />
                                {t(`tasks.priority.${p}`)}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("tasks.fields.status")}
                      <Req />
                    </FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TASK_STATUS_ORDER.map((s) => (
                          <SelectItem key={s} value={s}>
                            <Badge className={cn("font-medium", STATUS_META[s].badgeClass)}>
                              {t(`tasks.status.${s}`)}
                            </Badge>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="due_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("tasks.fields.dueDate")}
                      <Req />
                    </FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {DUE_DATE_PRESETS.map((preset) => {
                        const value = isoDatePlus(preset.days);
                        const active = field.value === value;
                        return (
                          <Button
                            key={preset.key}
                            type="button"
                            variant={active ? "default" : "outline"}
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => field.onChange(value)}
                          >
                            {t(`tasks.dueDatePresets.${preset.key}`)}
                          </Button>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="assigned_to_user_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("tasks.fields.assignee")}
                      <Req />
                    </FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("tasks.fields.assignee")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {admins.map((a) => (
                          <SelectItem key={a.user_id} value={a.user_id}>
                            <span className="flex items-center gap-2">
                              <Avatar className="h-5 w-5">
                                {a.profile_image && (
                                  <AvatarImage src={a.profile_image} alt={`${a.first_name} ${a.last_name}`} />
                                )}
                                <AvatarFallback className="text-[9px]">
                                  {`${a.first_name?.[0] ?? ""}${a.last_name?.[0] ?? ""}`.toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              {a.first_name} {a.last_name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="hotel_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("tasks.fields.venue")}
                      <Req />
                    </FormLabel>
                    <FormControl>
                      <SelectField
                        options={hotels.map((hotel) => ({ value: hotel.id, label: hotel.name }))}
                        value={field.value || undefined}
                        onChange={handleHotelChange}
                        placeholder={t("tasks.fields.selectVenue")}
                        aria-label={t("tasks.fields.venue")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormItem>
                <FormLabel>{t("tasks.fields.treatments")}</FormLabel>
                <MultiSelectField
                  options={treatments.map((treatment) => ({
                    value: treatment.id,
                    label: treatmentLabel(treatment),
                  }))}
                  value={treatmentIds}
                  onChange={setTreatmentIds}
                  disabled={!hotelId}
                  placeholder={hotelId ? t("tasks.fields.noTreatment") : t("tasks.fields.selectVenueFirst")}
                  aria-label={t("tasks.fields.treatments")}
                />
              </FormItem>

              <FormItem>
                <FormLabel>{t("tasks.fields.therapists")}</FormLabel>
                <MultiSelectField
                  options={therapists.map((therapist) => ({
                    value: therapist.id,
                    label: `${therapist.first_name ?? ""} ${therapist.last_name ?? ""}`.trim(),
                  }))}
                  value={therapistIds}
                  onChange={setTherapistIds}
                  disabled={!hotelId}
                  placeholder={hotelId ? t("tasks.fields.noTherapist") : t("tasks.fields.selectVenueFirst")}
                  aria-label={t("tasks.fields.therapists")}
                />
              </FormItem>

              <FormItem className="sm:col-span-2">
                <FormLabel>{t("tasks.fields.checklist")}</FormLabel>
                <TaskChecklist value={checklist} onChange={setChecklist} />
              </FormItem>

              <FormItem className="sm:col-span-2">
                <FormLabel>{t("tasks.fields.attachments")}</FormLabel>
                <TaskAttachments value={attachments} onChange={setAttachments} />
              </FormItem>

              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>{t("tasks.fields.linkedBooking")}</FormLabel>
                  {booking && (
                    <a
                      href={`/admin/bookings/${booking.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {t("tasks.openLink")}
                    </a>
                  )}
                </div>
                <EntitySearchCombobox<BookingSearchResult>
                  value={booking}
                  onChange={handleBookingChange}
                  search={searchBookings}
                  getKey={(b) => b.id}
                  getLabel={(b) =>
                    `#${b.booking_id ?? "?"} · ${b.client_first_name ?? ""} ${b.client_last_name ?? ""}`.trim()
                  }
                  placeholder={t("tasks.fields.noBooking")}
                  searchPlaceholder={t("tasks.fields.searchBooking")}
                  emptyText={t("tasks.fields.noResults")}
                />
              </FormItem>

              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>{t("tasks.fields.linkedCustomer")}</FormLabel>
                  {customer && (
                    <a
                      href={`/admin/customers/${customer.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {t("tasks.openLink")}
                    </a>
                  )}
                </div>
                <EntitySearchCombobox<CustomerSearchResult>
                  value={customer}
                  onChange={setCustomer}
                  search={(q) => searchCustomers(supabase, q)}
                  getKey={(c) => c.id}
                  getLabel={(c) => `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || (c.email ?? c.phone ?? "")}
                  placeholder={t("tasks.fields.noCustomer")}
                  searchPlaceholder={t("tasks.fields.searchCustomer")}
                  emptyText={t("tasks.fields.noResults")}
                />
              </FormItem>
            </div>

            <DialogFooter className="shrink-0 flex-row gap-2 border-t px-6 py-4 sm:justify-between">
              {task ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700"
                  onClick={handleDelete}
                  disabled={remove.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("common.delete")}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {task ? t("common.save") : t("tasks.create")}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
