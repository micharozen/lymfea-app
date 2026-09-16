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
  TASK_CHANNEL_META,
  TASK_CHANNEL_ORDER,
  TASK_FEEDBACK_TYPE_ORDER,
  TASK_STATUS_ORDER,
  TASK_TYPE_META,
  TASK_TYPE_ORDER,
  TASK_TYPES_REQUIRING_BOOKING,
} from "./taskConstants";
import { BOOKING_CLIENT_TYPES, CLIENT_TYPE_META } from "@/lib/clientTypeMeta";
import { formatBookingLabel } from "@/lib/bookingSearch";
import { EntitySearchCombobox } from "./EntitySearchCombobox";
import { TaskChecklist } from "./TaskChecklist";
import { TaskDetailView } from "./TaskDetailView";
import { bookingContextPatch } from "./bookingContext";
import { TaskInquiryPaste, type ParsedInquiryText } from "./TaskInquiryPaste";
import { InquiryThreadView } from "@/components/admin/inbox/InquiryThreadView";
import { useTaskMessages, rootMessageOf } from "@/hooks/tasks/useTaskMessages";
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
      "inbound_request",
      "other",
    ]),
    task_type_other: z.string().optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    status: z.enum(["todo", "in_progress", "done"]),
    due_date: z.string(),
    assigned_to_user_id: z.string(),
    hotel_id: z.string().min(1),
    channel: z.string().optional(),
    feedback_type: z.string().optional(),
    client_type: z.string().optional(),
    treatment_date: z.string().optional(),
    prospect_first_name: z.string().optional(),
    prospect_last_name: z.string().optional(),
    prospect_email: z.string().optional(),
    prospect_phone: z.string().optional(),
    booking_id: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    // Le libellé libre n'est exigé que sur le type « Autre ».
    if (values.task_type === "other" && !values.task_type_other?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["task_type_other"],
        message: "required",
      });
    }
    // « Suivi résa » n'a pas de sens sans réservation : c'est elle qui porte le
    // contexte (lieu, soins, thérapeutes, date, client).
    if (TASK_TYPES_REQUIRING_BOOKING.includes(values.task_type) && !values.booking_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["booking_id"],
        message: "required",
      });
    }
    // Une demande entrante arrive souvent sans échéance ni propriétaire — et
    // celles créées par le webhook n'en ont aucun. Les exiger empêcherait de
    // les rouvrir pour les compléter.
    if (values.task_type === "inbound_request") return;
    if (!values.due_date) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["due_date"], message: "required" });
    }
    if (!values.assigned_to_user_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assigned_to_user_id"],
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
      task_type: "inbound_request",
      task_type_other: "",
      priority: "medium",
      status: defaultStatus ?? "todo",
      due_date: "",
      assigned_to_user_id: userId ?? "",
      hotel_id: "",
      channel: "",
      feedback_type: "",
      client_type: "",
      treatment_date: "",
      prospect_first_name: "",
      prospect_last_name: "",
      prospect_email: "",
      prospect_phone: "",
      booking_id: "",
    },
  });

  const taskType = form.watch("task_type");
  const hotelId = form.watch("hotel_id");
  const isInboundRequest = taskType === "inbound_request";
  const bookingRequired = TASK_TYPES_REQUIRING_BOOKING.includes(taskType);

  // Le formulaire se fige pendant l'analyse : les champs vont être réécrits.
  const [analyzing, setAnalyzing] = useState(false);

  const { data: taskMessages } = useTaskMessages(open ? task?.id : null);
  const rootMessage = rootMessageOf(taskMessages);

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
        channel: task.channel ?? "",
        feedback_type: task.feedback_type ?? "",
        client_type: task.client_type ?? "",
        treatment_date: task.treatment_date ?? "",
        prospect_first_name: task.prospect_first_name ?? "",
        prospect_last_name: task.prospect_last_name ?? "",
        prospect_email: task.prospect_email ?? "",
        prospect_phone: task.prospect_phone ?? "",
        booking_id: task.booking_id ?? "",
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
              booking_date: task.booking.booking_date,
              hotel_id: task.hotel_id,
              client_type: task.client_type,
              client_first_name: task.booking.client_first_name,
              client_last_name: task.booking.client_last_name,
              booking_treatments: null,
              booking_therapists: null,
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
        task_type: "inbound_request",
        task_type_other: "",
        priority: "medium",
        status: defaultStatus ?? "todo",
        due_date: "",
        assigned_to_user_id: userId ?? "",
        hotel_id: "",
        channel: "",
        feedback_type: "",
        client_type: "",
        treatment_date: "",
        prospect_first_name: "",
        prospect_last_name: "",
        prospect_email: "",
        prospect_phone: "",
        booking_id: defaultBooking?.id ?? "",
      });
      setTreatmentIds([]);
      setTherapistIds([]);
      setChecklist([]);
      setAttachments([]);
      setBooking(defaultBooking ?? null);
      setCustomer(defaultCustomer ?? null);
    }
  }, [open, task, defaultStatus, userId, form, defaultBooking, defaultCustomer]);

  // Un seul lieu dans l'organisation : il n'y a rien à choisir. On le
  // sélectionne d'office, ce qui débloque du même coup les soins, les
  // thérapeutes et l'analyse du texte collé.
  //
  // Déclaré après l'effet de réinitialisation : les effets s'exécutent dans
  // leur ordre de déclaration, et un reset postérieur remettrait le champ à
  // vide quand la liste des lieux est déjà en cache.
  useEffect(() => {
    if (!open || hotels.length !== 1) return;
    if (form.getValues("hotel_id")) return;
    form.setValue("hotel_id", hotels[0].id, { shouldValidate: true });
  }, [open, hotels, form]);

  const onSubmit = async (values: FormValues) => {
    const shared = {
      title: values.title,
      description: values.description || null,
      task_type: values.task_type,
      task_type_other: values.task_type === "other" ? values.task_type_other?.trim() || null : null,
      priority: values.priority,
      status: values.status,
      due_date: values.due_date || null,
      hotel_id: values.hotel_id,
      treatment_menu_ids: treatmentIds,
      therapist_ids: therapistIds,
      checklist: checklist.filter((item) => item.label.trim() !== ""),
      attachments,
      booking_id: booking?.id ?? null,
      customer_id: customer?.id ?? null,
      assigned_to_user_id: values.assigned_to_user_id || null,
      channel: values.channel || null,
      feedback_type: values.feedback_type || null,
      client_type: values.client_type || null,
      treatment_date: values.treatment_date || null,
      // Coordonnées d'un prospect sans fiche client. Dès qu'un client est lié,
      // c'est lui qui fait foi : on n'entretient pas deux identités.
      prospect_first_name: customer ? null : values.prospect_first_name?.trim() || null,
      prospect_last_name: customer ? null : values.prospect_last_name?.trim() || null,
      prospect_email: customer ? null : values.prospect_email?.trim() || null,
      prospect_phone: customer ? null : values.prospect_phone?.trim() || null,
      // taskColumns() écrit un patch complet : sans cette reprise, rouvrir une
      // tâche déjà convertie effacerait le lien vers sa réservation.
      converted_booking_id: task?.converted_booking_id ?? null,
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

  // Rattacher une réservation reprend ce qu'elle sait déjà — client, lieu,
  // soins, thérapeutes, date, type de client — pour éviter la double saisie.
  // Rien n'est verrouillé : chaque champ reste modifiable ensuite.
  const handleBookingChange = (b: BookingSearchResult | null) => {
    setBooking(b);
    form.setValue("booking_id", b?.id ?? "", { shouldValidate: true });
    if (!b) return;

    // Règle partagée avec la vue détaillée : le même geste doit remplir la
    // tâche de la même façon des deux côtés.
    const patch = bookingContextPatch(b);
    if (b.customer) {
      setCustomer({
        id: b.customer.id,
        first_name: b.customer.first_name,
        last_name: b.customer.last_name,
        phone: b.customer.phone ?? "",
        email: b.customer.email ?? "",
      });
    }
    if (patch.hotel_id) form.setValue("hotel_id", patch.hotel_id, { shouldValidate: true });
    if (patch.treatment_date) form.setValue("treatment_date", patch.treatment_date);
    if (patch.client_type) form.setValue("client_type", patch.client_type);
    if (patch.treatment_menu_ids) setTreatmentIds(patch.treatment_menu_ids);
    if (patch.therapist_ids) setTherapistIds(patch.therapist_ids);
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

  // Le champ réservation change de place selon le type : sur « Suivi résa » il
  // remonte juste sous le type, car c'est lui qui alimente tout le reste du
  // formulaire. Ailleurs il reste parmi les liens optionnels, en bas.
  const bookingField = (
    <FormField
      control={form.control}
      name="booking_id"
      render={() => (
        <FormItem>
          <div className="flex items-center justify-between">
            <FormLabel className="text-xs">
              {t("tasks.fields.linkedBooking")}
              {bookingRequired && <Req />}
            </FormLabel>
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
            getLabel={formatBookingLabel}
            placeholder={t("tasks.fields.noBooking")}
            searchPlaceholder={t("tasks.fields.searchBooking")}
            emptyText={t("tasks.fields.noResults")}
          />
          {bookingRequired && (
            <p className="text-muted-foreground text-xs">{t("tasks.fields.bookingRequiredHint")}</p>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  /**
   * Applique le résultat de l'analyse : les champs sont *proposés*, donc on ne
   * remplit que ce qui est encore vide — une saisie de l'opérateur prime
   * toujours sur l'extraction.
   */
  const applyParsedInquiry = (parsed: ParsedInquiryText) => {
    const fillIfEmpty = (name: keyof FormValues, value?: string | null) => {
      if (!value || form.getValues(name)) return;
      form.setValue(name, value);
    };
    fillIfEmpty("prospect_first_name", parsed.client_first_name);
    fillIfEmpty("prospect_last_name", parsed.client_last_name);
    fillIfEmpty("prospect_email", parsed.email);
    fillIfEmpty("prospect_phone", parsed.phone);
    fillIfEmpty("treatment_date", parsed.requested_date);
    // `notes` est le raisonnement du modèle, en anglais : il ne fait pas un
    // titre. On prend le résumé qu'il a rédigé pour ça, sinon le nom du client.
    if (!form.getValues("title")) {
      const name = [parsed.client_first_name, parsed.client_last_name].filter(Boolean).join(" ");
      const title = parsed.summary?.trim() || (name ? `Demande — ${name}` : "");
      if (title) form.setValue("title", title);
    }
    if (parsed.treatment_match?.id && treatmentIds.length === 0) {
      setTreatmentIds([parsed.treatment_match.id]);
    }
  };

  const saving = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          "flex max-h-[90vh] flex-col gap-0 p-0 text-sm",
          // index.css impose min-height:44px à tous les <button> (cible tactile).
          // L'exception « admin desktop » qui y est prévue ne s'applique pas :
          // sa spécificité (0-1-2) est inférieure à celle de la règle (0-2-1).
          // On la neutralise ici, en gardant la cible tactile sous `sm`.
          "sm:[&_button]:!min-h-0",
          task ? "sm:max-w-4xl" : "sm:max-w-3xl",
        )}
      >
        <DialogHeader className={cn("shrink-0 px-5", task ? "sr-only" : "pt-4 pb-2")}>
          <DialogTitle className="font-normal">
            {task ? task.title : t("tasks.newTitle")}
          </DialogTitle>
        </DialogHeader>

        {/* Une tâche existante se lit d'abord, chaque champ s'éditant sur place.
            La création reste un formulaire : il n'y a rien à lire. */}
        {task ? (
          <TaskDetailView task={task} onClose={onClose} onDelete={handleDelete} />
        ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div
              className={cn(
                "grid min-h-0 flex-1 grid-cols-1 gap-x-4 gap-y-3 overflow-y-auto px-5 py-3 sm:grid-cols-2",
                // Les champs du design system sont dimensionnés pour des pages,
                // pas pour un formulaire de vingt lignes : on les resserre ici
                // seulement, sans toucher aux composants partagés.
                "[&_input]:h-9 [&_input]:text-sm [&_textarea]:text-sm [&_button]:text-sm",
              )}
            >
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel className="text-xs">
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
                name="hotel_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">
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

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel className="text-xs">{t("tasks.fields.description")}</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={4}
                        disabled={analyzing}
                        placeholder={
                          isInboundRequest
                            ? t("tasks.fields.descriptionOrPastePlaceholder")
                            : t("tasks.fields.descriptionPlaceholder")
                        }
                      />
                    </FormControl>
                    {/* Une seule zone de saisie : on colle la demande ici et
                        l'IA en tire les champs. La description reste éditable. */}
                    {isInboundRequest && (
                      <TaskInquiryPaste
                        hotelId={hotelId}
                        text={field.value ?? ""}
                        disabled={analyzing}
                        onLoadingChange={setAnalyzing}
                        onExtracted={applyParsedInquiry}
                      />
                    )}
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="task_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">
                      {t("tasks.fields.taskType")}
                      <Req />
                    </FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="h-9">
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

              {bookingRequired && bookingField}

              {taskType === "other" && (
                <FormField
                  control={form.control}
                  name="task_type_other"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">
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
                    <FormLabel className="text-xs">
                      {t("tasks.fields.priority")}
                      <Req />
                    </FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="h-9">
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
                    <FormLabel className="text-xs">
                      {t("tasks.fields.status")}
                      <Req />
                    </FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="h-9">
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
                    <FormLabel className="text-xs">
                      {t("tasks.fields.dueDate")}
                      {!isInboundRequest && <Req />}
                    </FormLabel>
                    <FormControl>
                      <Input type="date" className="h-9" {...field} />
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
                name="treatment_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t("tasks.fields.treatmentDate")}</FormLabel>
                    <FormControl>
                      <Input type="date" className="h-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="channel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t("tasks.fields.channel")}</FormLabel>
                    <FormControl>
                      <SelectField
                        options={TASK_CHANNEL_ORDER.map((channel) => {
                          const Icon = TASK_CHANNEL_META[channel].icon;
                          return {
                            value: channel,
                            label: t(`tasks.channel.${channel}`),
                            icon: <Icon className="h-4 w-4" />,
                          };
                        })}
                        value={field.value || undefined}
                        onChange={field.onChange}
                        placeholder={t("tasks.fields.noChannel")}
                        aria-label={t("tasks.fields.channel")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="feedback_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t("tasks.fields.feedbackType")}</FormLabel>
                    <FormControl>
                      <SelectField
                        options={TASK_FEEDBACK_TYPE_ORDER.map((value) => ({
                          value,
                          label: t(`tasks.feedbackType.${value}`),
                        }))}
                        value={field.value || undefined}
                        onChange={field.onChange}
                        placeholder={t("tasks.fields.noFeedbackType")}
                        aria-label={t("tasks.fields.feedbackType")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="client_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t("tasks.fields.clientType")}</FormLabel>
                    <FormControl>
                      <SelectField
                        options={BOOKING_CLIENT_TYPES.map((value) => ({
                          value,
                          label: t(CLIENT_TYPE_META[value].labelKey),
                        }))}
                        value={field.value || undefined}
                        onChange={field.onChange}
                        placeholder={t("tasks.fields.noClientType")}
                        aria-label={t("tasks.fields.clientType")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="assigned_to_user_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">
                      {t("tasks.fields.assignee")}
                      {!isInboundRequest && <Req />}
                    </FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="h-9">
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

              <FormItem>
                <FormLabel className="text-xs">{t("tasks.fields.treatments")}</FormLabel>
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
                <FormLabel className="text-xs">{t("tasks.fields.therapists")}</FormLabel>
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
                <FormLabel className="text-xs">{t("tasks.fields.checklist")}</FormLabel>
                <TaskChecklist value={checklist} onChange={setChecklist} />
              </FormItem>

              <FormItem className="sm:col-span-2">
                <FormLabel className="text-xs">{t("tasks.fields.attachments")}</FormLabel>
                <TaskAttachments value={attachments} onChange={setAttachments} />
              </FormItem>

              {/* Le fil ne s'affiche que s'il existe : une demande arrivée par
                  téléphone ou au comptoir n'a aucun message. */}
              {rootMessage && (
                <FormItem className="sm:col-span-2">
                  <FormLabel className="text-xs">{t("tasks.messages.title")}</FormLabel>
                  <InquiryThreadView rootInquiryId={rootMessage.id} />
                </FormItem>
              )}


              {!bookingRequired && bookingField}

              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel className="text-xs">{t("tasks.fields.linkedCustomer")}</FormLabel>
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

              {/* Une demande arrive souvent avant que le client n'existe en base.
                  On garde ses coordonnées sur la tâche : la fiche customers ne
                  sera résolue ou créée qu'à la conversion en réservation. Dès
                  qu'un client est lié, ce bloc s'efface — on n'entretient pas
                  deux identités concurrentes. */}
              {!customer && (
                <FormItem className="sm:col-span-2">
                  <FormLabel className="text-xs">{t("tasks.fields.prospect")}</FormLabel>
                  <p className="text-muted-foreground text-xs">
                    {t("tasks.fields.prospectHint")}
                  </p>
                  <div className="grid gap-3 pt-1 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="prospect_first_name"
                      render={({ field }) => (
                        <FormControl>
                          <Input placeholder={t("tasks.fields.prospectFirstName")}
                            aria-label={t("tasks.fields.prospectFirstName")}
                            {...field} />
                        </FormControl>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="prospect_last_name"
                      render={({ field }) => (
                        <FormControl>
                          <Input placeholder={t("tasks.fields.prospectLastName")}
                            aria-label={t("tasks.fields.prospectLastName")}
                            {...field} />
                        </FormControl>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="prospect_email"
                      render={({ field }) => (
                        <FormControl>
                          <Input
                            type="email"
                            placeholder={t("tasks.fields.prospectEmail")}
                            aria-label={t("tasks.fields.prospectEmail")}
                            {...field}
                          />
                        </FormControl>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="prospect_phone"
                      render={({ field }) => (
                        <FormControl>
                          <Input
                            type="tel"
                            placeholder={t("tasks.fields.prospectPhone")}
                            aria-label={t("tasks.fields.prospectPhone")}
                            {...field}
                          />
                        </FormControl>
                      )}
                    />
                  </div>
                </FormItem>
              )}
            </div>

            <DialogFooter className="shrink-0 flex-row flex-wrap gap-2 border-t px-5 py-3 sm:justify-between">
              {/* Ce formulaire ne sert plus qu'à la création : suppression et
                  conversion vivent dans TaskDetailView. */}
              <span />
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
        )}
      </DialogContent>
    </Dialog>
  );
}
