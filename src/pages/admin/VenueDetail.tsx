import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ArrowLeft, Loader2, Save, Pencil, CalendarDays, Eye } from "lucide-react";
import { startOfMonth, startOfYear, subDays } from "date-fns";
import { VenueGeneralTab } from "@/components/admin/venue/VenueGeneralTab";
import { VenueSectionNavBar, VENUE_CONFIG_SECTIONS } from "@/components/admin/venue/VenueSectionNav";
import { VenueBookingCalendar } from "@/components/admin/venue/VenueBookingCalendar";
import { VenueCatalogTab } from "@/components/admin/venue/VenueCatalogTab";
import { VenueResourcesTab } from "@/components/admin/venue/VenueResourcesTab";
import { VenueClientPreviewTab } from "@/components/admin/venue/VenueClientPreviewTab";
import { VenueBillingTab } from "@/components/admin/venue/VenueBillingTab";
import { DeploymentScheduleState } from "@/components/admin/steps/VenueDeploymentStep";
import { formatPrice } from "@/lib/formatPrice";
import type { VenueWizardFormValues, BlockedSlot } from "@/components/admin/VenueWizardDialog";

// Same form schema as VenueWizardDialog
const createFormSchema = (t: TFunction) => z.object({
  name: z.string().min(1, t('errors.validation.nameRequired')),
  slug: z
    .string()
    .min(2, "Au moins 2 caractères")
    .max(60, "60 caractères max")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Lettres minuscules, chiffres et tirets uniquement"
    )
    .optional()
    .or(z.literal("")),
  venue_type: z.enum(['hotel', 'coworking', 'enterprise']).default('hotel'),
  address: z.string().min(1, t('errors.validation.addressRequired')),
  postal_code: z.string().optional(),
  city: z.string().min(1, t('errors.validation.cityRequired')),
  country: z.string().min(1, t('errors.validation.countryRequired')),
  currency: z.string().default("EUR"),
  vat: z.string().default("20"),
  hotel_commission: z.string().default("0"),
  therapist_commission: z.string().default("0"),
  global_therapist_commission: z.boolean().default(true),
  status: z.string().default("active"),
  timezone: z.string().default("Europe/Paris"),
  opening_time: z.string().default("10:00"),
  closing_time: z.string().default("20:00"),
  slot_interval: z.number().default(30),
  auto_validate_bookings: z.boolean().default(false),
  allow_out_of_hours_booking: z.boolean().default(false),
  out_of_hours_surcharge_percent: z.string().default("0"),
  inter_venue_buffer_minutes: z.number().min(0).max(120).default(0),
  room_turnover_buffer_minutes: z.number().min(0).max(120).default(0),
  booking_hold_enabled: z.boolean().default(true),
  booking_hold_duration_minutes: z.coerce.number().int().min(1).max(15).default(5),
  offert: z.boolean().default(false),
  company_offered: z.boolean().default(false),
  landing_subtitle: z.string().optional(),
  name_en: z.string().optional(),
  landing_subtitle_en: z.string().optional(),
  description_en: z.string().optional(),
  calendar_color: z.string().default('#3b82f6'),
}).refine((data) => {
  if (!data.global_therapist_commission) return true;
  const hotelComm = parseFloat(data.hotel_commission) || 0;
  const therapistComm = parseFloat(data.therapist_commission) || 0;
  return hotelComm + therapistComm <= 100;
}, {
  message: t('errors.validation.commissionExceeds100'),
  path: ["hotel_commission"],
}).refine((data) => {
  return data.opening_time < data.closing_time;
}, {
  message: "L'heure d'ouverture doit être avant l'heure de fermeture",
  path: ["closing_time"],
});

export default function VenueDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const formSchema = useMemo(() => createFormSchema(t), [t]);

  const isNewMode = !id;
  const [savedHotelId, setSavedHotelId] = useState<string | null>(id || null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("configuration");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [existingScheduleId, setExistingScheduleId] = useState<string | null>(null);
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [hotelName, setHotelName] = useState("");
  const [hotelSlug, setHotelSlug] = useState<string | null>(null);
  const [isEditingState, setIsEditingState] = useState(false);
  const [statsPeriod, setStatsPeriod] = useState<"month" | "30d" | "year" | "all">("month");
  const isEditing = isNewMode || isEditingState;

  // Deployment schedule state
  const [deploymentState, setDeploymentState] = useState<DeploymentScheduleState>({
    isAlwaysOpen: true,
    scheduleType: "specific_days",
    selectedDays: [],
    recurringStartDate: undefined,
    recurringEndDate: undefined,
    specificDates: [],
    recurrenceInterval: 1,
  });

  const {
    url: hotelImage,
    setUrl: setHotelImage,
    uploading: uploadingHotel,
    fileInputRef: hotelImageRef,
    handleUpload: handleHotelImageUpload,
    triggerFileSelect: triggerHotelImageSelect,
  } = useFileUpload();

  const {
    url: coverImage,
    setUrl: setCoverImage,
    uploading: uploadingCover,
    fileInputRef: coverImageRef,
    handleUpload: handleCoverImageUpload,
    triggerFileSelect: triggerCoverImageSelect,
  } = useFileUpload();

  const form = useForm<VenueWizardFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      slug: "",
      venue_type: "hotel",
      address: "",
      postal_code: "",
      city: "",
      country: "",
      currency: "EUR",
      vat: "20",
      hotel_commission: "0",
      therapist_commission: "0",
      global_therapist_commission: true,
      status: "active",
      timezone: "Europe/Paris",
      opening_time: "10:00",
      closing_time: "20:00",
      slot_interval: 30,
      auto_validate_bookings: false,
      allow_out_of_hours_booking: false,
      out_of_hours_surcharge_percent: "0",
      inter_venue_buffer_minutes: 0,
      room_turnover_buffer_minutes: 0,
      booking_hold_enabled: true,
      booking_hold_duration_minutes: 5,
      offert: false,
      company_offered: false,
      landing_subtitle: "",
      calendar_color: "#3b82f6",
    },
  });

  // Load data in edit mode
  useEffect(() => {
    if (id) {
      loadHotelData(id);
    }
  }, [id]);

  const loadHotelData = async (hotelId: string) => {
    setLoading(true);
    try {
      // Load hotel data
      const { data: hotel, error: hotelError } = await supabase
        .from("hotels")
        .select("*")
        .eq("id", hotelId)
        .single();

      if (hotelError) throw hotelError;

      if (hotel) {
        form.reset({
          name: hotel.name || "",
          slug: (hotel as any).slug || "",
          venue_type: hotel.venue_type || "hotel",
          address: hotel.address || "",
          postal_code: hotel.postal_code || "",
          city: hotel.city || "",
          country: hotel.country || "",
          currency: hotel.currency || "EUR",
          vat: hotel.vat?.toString() || "20",
          hotel_commission: hotel.hotel_commission?.toString() || "0",
          therapist_commission: hotel.therapist_commission?.toString() || "0",
          global_therapist_commission: hotel.global_therapist_commission !== false,
          status: hotel.status || "active",
          timezone: hotel.timezone || "Europe/Paris",
          opening_time: hotel.opening_time?.substring(0, 5) || "10:00",
          closing_time: hotel.closing_time?.substring(0, 5) || "20:00",
          slot_interval: hotel.slot_interval || 30,
          auto_validate_bookings: hotel.auto_validate_bookings || false,
          allow_out_of_hours_booking: hotel.allow_out_of_hours_booking || false,
          out_of_hours_surcharge_percent: hotel.out_of_hours_surcharge_percent?.toString() || "0",
          inter_venue_buffer_minutes: (hotel as any).inter_venue_buffer_minutes ?? 0,
          room_turnover_buffer_minutes: (hotel as any).room_turnover_buffer_minutes ?? 0,
          booking_hold_enabled: (hotel as any).booking_hold_enabled ?? true,
          booking_hold_duration_minutes: (hotel as any).booking_hold_duration_minutes ?? 5,
          offert: hotel.offert || false,
          company_offered: hotel.company_offered || false,
          landing_subtitle: (hotel as any).landing_subtitle || "",
          name_en: (hotel as any).name_en || "",
          landing_subtitle_en: (hotel as any).landing_subtitle_en || "",
          description_en: (hotel as any).description_en || "",
          calendar_color: hotel.calendar_color || "#3b82f6",
        });

        setHotelImage(hotel.image || "");
        setCoverImage(hotel.cover_image || "");
        setHotelName(hotel.name || "");
        setHotelSlug((hotel as any).slug || null);
      }

      // Load deployment schedule
      const { data: schedule } = await supabase
        .from("venue_deployment_schedules")
        .select("*")
        .eq("hotel_id", hotelId)
        .maybeSingle();

      if (schedule) {
        setExistingScheduleId(schedule.id);
        setDeploymentState({
          isAlwaysOpen: schedule.schedule_type === "always_open",
          scheduleType: schedule.schedule_type === "one_time" ? "one_time" : "specific_days",
          selectedDays: schedule.days_of_week || [],
          recurringStartDate: schedule.recurring_start_date ? new Date(schedule.recurring_start_date) : undefined,
          recurringEndDate: schedule.recurring_end_date ? new Date(schedule.recurring_end_date) : undefined,
          specificDates: (schedule.specific_dates || []).map((d: string) => new Date(d)),
          recurrenceInterval: schedule.recurrence_interval || 1,
        });
      }

      // Load blocked slots
      const { data: blockedSlotsData } = await supabase
        .from("venue_blocked_slots")
        .select("*")
        .eq("hotel_id", hotelId)
        .order("start_time");

      if (blockedSlotsData) {
        setBlockedSlots(blockedSlotsData.map((slot: any) => ({
          id: slot.id,
          label: slot.label,
          start_time: slot.start_time.substring(0, 5),
          end_time: slot.end_time.substring(0, 5),
          days_of_week: slot.days_of_week,
          is_active: slot.is_active,
        })));
      }
    } catch (error) {
      console.error("Error loading hotel data:", error);
      toast.error("Erreur lors du chargement des données");
    } finally {
      setLoading(false);
    }
  };

  const saveDeploymentSchedule = async (targetHotelId: string) => {
    const schedulePayload = {
      hotel_id: targetHotelId,
      schedule_type: deploymentState.isAlwaysOpen
        ? "always_open" as const
        : deploymentState.scheduleType,
      days_of_week: deploymentState.isAlwaysOpen
        ? null
        : deploymentState.scheduleType === "specific_days"
          ? deploymentState.selectedDays
          : null,
      recurring_start_date: deploymentState.isAlwaysOpen
        ? null
        : deploymentState.scheduleType === "specific_days"
          ? deploymentState.recurringStartDate
            ? format(deploymentState.recurringStartDate, "yyyy-MM-dd")
            : format(new Date(), "yyyy-MM-dd")
          : null,
      recurring_end_date: deploymentState.isAlwaysOpen
        ? null
        : deploymentState.scheduleType === "specific_days" && deploymentState.recurringEndDate
          ? format(deploymentState.recurringEndDate, "yyyy-MM-dd")
          : null,
      specific_dates: deploymentState.isAlwaysOpen
        ? null
        : deploymentState.scheduleType === "one_time"
          ? deploymentState.specificDates.map(d => format(d, "yyyy-MM-dd"))
          : null,
      recurrence_interval: deploymentState.isAlwaysOpen
        ? 1
        : deploymentState.scheduleType === "specific_days"
          ? deploymentState.recurrenceInterval
          : 1,
    };

    if (existingScheduleId) {
      const { error } = await supabase
        .from("venue_deployment_schedules")
        .update(schedulePayload)
        .eq("id", existingScheduleId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from("venue_deployment_schedules")
        .insert(schedulePayload)
        .select("id")
        .single();
      if (error) throw error;
      if (data) setExistingScheduleId(data.id);
    }
  };

  const saveBlockedSlots = async (targetHotelId: string) => {
    const { data: existingSlots } = await supabase
      .from("venue_blocked_slots")
      .select("id")
      .eq("hotel_id", targetHotelId);

    const existingIds = new Set((existingSlots || []).map((s: any) => s.id));
    const currentIds = new Set(blockedSlots.filter(s => s.id).map(s => s.id!));

    // Delete removed slots
    const toDelete = [...existingIds].filter(id => !currentIds.has(id));
    if (toDelete.length > 0) {
      await supabase
        .from("venue_blocked_slots")
        .delete()
        .in("id", toDelete);
    }

    // Upsert current slots
    for (const slot of blockedSlots) {
      const payload = {
        hotel_id: targetHotelId,
        label: slot.label,
        start_time: slot.start_time + ":00",
        end_time: slot.end_time + ":00",
        days_of_week: slot.days_of_week,
        is_active: slot.is_active,
      };

      if (slot.id) {
        await supabase
          .from("venue_blocked_slots")
          .update(payload)
          .eq("id", slot.id);
      } else {
        await supabase
          .from("venue_blocked_slots")
          .insert(payload);
      }
    }
  };

  const validateDeployment = (): boolean => {
    if (deploymentState.isAlwaysOpen) return true;

    if (deploymentState.scheduleType === "specific_days") {
      if (deploymentState.selectedDays.length === 0) {
        toast.error("Veuillez sélectionner au moins un jour");
        return false;
      }
    } else if (deploymentState.scheduleType === "one_time") {
      if (deploymentState.specificDates.length === 0) {
        toast.error("Veuillez sélectionner au moins une date");
        return false;
      }
    }

    return true;
  };

  const handleSave = async () => {
    // Validate form
    const isValid = await form.trigger();
    if (!isValid) {
      const errors = form.formState.errors;
      const missingFields: string[] = [];
      if (errors.name) missingFields.push("Nom");
      if (errors.address) missingFields.push("Adresse");
      if (errors.city) missingFields.push("Ville");
      if (errors.country) missingFields.push("Pays");
      if (errors.hotel_commission) missingFields.push("Commission");
      toast.error(
        missingFields.length > 0
          ? `Champs requis manquants : ${missingFields.join(", ")}`
          : "Veuillez corriger les erreurs du formulaire"
      );
      setActiveTab("configuration");
      return;
    }

    // Validate deployment
    if (!validateDeployment()) {
      setActiveTab("configuration");
      return;
    }

    setSaving(true);
    try {
      const values = form.getValues();

      const hotelPayload = {
        name: values.name,
        ...(values.slug ? { slug: values.slug } : {}),
        venue_type: values.venue_type,
        address: values.address,
        postal_code: values.postal_code || null,
        city: values.city,
        country: values.country,
        currency: values.currency,
        vat: parseFloat(values.vat),
        hotel_commission: parseFloat(values.hotel_commission),
        therapist_commission: parseFloat(values.therapist_commission),
        global_therapist_commission: values.global_therapist_commission,
        status: values.status,
        image: hotelImage || null,
        cover_image: coverImage || null,
        timezone: values.timezone,
        opening_time: values.opening_time + ':00',
        closing_time: values.closing_time + ':00',
        slot_interval: values.slot_interval,
        auto_validate_bookings: values.auto_validate_bookings,
        allow_out_of_hours_booking: values.allow_out_of_hours_booking,
        out_of_hours_surcharge_percent: parseFloat(values.out_of_hours_surcharge_percent) || 0,
        inter_venue_buffer_minutes: values.inter_venue_buffer_minutes ?? 0,
        room_turnover_buffer_minutes: values.room_turnover_buffer_minutes ?? 0,
        booking_hold_enabled: values.booking_hold_enabled,
        booking_hold_duration_minutes: values.booking_hold_duration_minutes,
        offert: values.offert,
        company_offered: values.company_offered,
        landing_subtitle: values.landing_subtitle || null,
        name_en: values.name_en || null,
        landing_subtitle_en: values.landing_subtitle_en || null,
        description_en: values.description_en || null,
        calendar_color: values.calendar_color || '#3b82f6',
      };

      if (isNewMode && !savedHotelId) {
        // INSERT new hotel
        const { data: insertedHotel, error: hotelError } = await supabase
          .from("hotels")
          .insert(hotelPayload)
          .select('id')
          .single();

        if (hotelError) throw hotelError;

        const newId = insertedHotel.id;
        setSavedHotelId(newId);
        setHotelName(values.name);
        if (values.slug) setHotelSlug(values.slug);

        // Save deployment schedule
        await saveDeploymentSchedule(newId);

        // Save blocked slots
        await saveBlockedSlots(newId);

        toast.success("Lieu créé avec succès");

        // Redirect to edit mode
        navigate(`/admin/places/${newId}`, { replace: true });
      } else {
        // UPDATE existing hotel
        const targetId = savedHotelId || id!;

        const { error: hotelError } = await supabase
          .from("hotels")
          .update(hotelPayload)
          .eq("id", targetId);

        if (hotelError) throw hotelError;

        setHotelName(values.name);
        if (values.slug) setHotelSlug(values.slug);

        // Update deployment schedule
        await saveDeploymentSchedule(targetId);

        // Save blocked slots
        await saveBlockedSlots(targetId);

        toast.success("Lieu mis à jour avec succès");
        setIsEditingState(false);
      }
    } catch (error: any) {
      console.error("Error saving venue:", error);
      if (error.code === '23505') {
        toast.error("Un lieu avec cet identifiant existe déjà");
      } else {
        toast.error("Erreur lors de l'enregistrement");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = async () => {
    if (id) {
      await loadHotelData(id);
    }
    setIsEditingState(false);
  };

  const effectiveHotelId = savedHotelId || id || null;
  const canAccessTabs = !!effectiveHotelId;

  // Watch name and currency for header display
  const watchedName = form.watch("name");
  const watchedCurrency = form.watch("currency");
  const watchedVenueType = form.watch("venue_type");

  // Fetch booking stats for header
  const { data: stats } = useQuery({
    queryKey: ["venue-stats", effectiveHotelId, statsPeriod],
    queryFn: async () => {
      let query = supabase
        .from("bookings")
        .select("total_price, status")
        .eq("hotel_id", effectiveHotelId!);

      if (statsPeriod !== "all") {
        const now = new Date();
        let fromDate: Date;
        if (statsPeriod === "month") {
          fromDate = startOfMonth(now);
        } else if (statsPeriod === "30d") {
          fromDate = subDays(now, 30);
        } else {
          fromDate = startOfYear(now);
        }
        query = query.gte("created_at", fromDate.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      let totalSales = 0;
      let bookingsCount = 0;
      (data || []).forEach((b) => {
        bookingsCount++;
        if (b.status === "completed" && b.total_price) {
          totalSales += Number(b.total_price);
        }
      });
      return { totalSales, bookingsCount };
    },
    enabled: !!effectiveHotelId,
  });

  return (
    <div className="bg-background">
      {/* Header — sticky within main scroll */}
      <div className="border-b bg-background sticky top-0 z-10">
        <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/admin/places')}
              className="flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Retour</span>
            </Button>
            <div className="h-5 w-px bg-border flex-shrink-0" />
            <h1 className="text-lg font-medium truncate">
              {isNewMode && !savedHotelId
                ? "Nouveau lieu"
                : watchedName || hotelName || "Lieu"}
            </h1>
            {stats && (
              <div className="hidden md:flex items-center gap-3 ml-1 pl-3 border-l">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-gold-600">
                    {formatPrice(stats.totalSales || 0, watchedCurrency || "EUR")}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {stats.bookingsCount || 0}
                  </span>
                </div>
                <Select value={statsPeriod} onValueChange={(v) => setStatsPeriod(v as typeof statsPeriod)}>
                  <SelectTrigger className="h-6 text-[11px] gap-1 px-2 w-auto min-w-[80px] border-dashed">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Ce mois</SelectItem>
                    <SelectItem value="30d">30 jours</SelectItem>
                    <SelectItem value="year">Cette année</SelectItem>
                    <SelectItem value="all">Tout</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {canAccessTabs && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewOpen(true)}
                className="flex-shrink-0"
              >
                <Eye className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Aperçu client</span>
              </Button>
            )}
            {isNewMode ? (
              <Button
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Enregistrer
              </Button>
            ) : isEditing ? (
              <>
                <Button
                  variant="outline"
                  onClick={handleCancelEdit}
                  disabled={saving}
                >
                  Annuler
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Enregistrer
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                onClick={() => setIsEditingState(true)}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Modifier
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12 flex-1">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Tab bar — sticky below header */}
          <div className="px-4 md:px-6 pt-4 bg-background sticky top-[57px] z-[9]">
            <TabsList className="w-full justify-start overflow-x-auto bg-transparent rounded-none border-b p-0 h-auto">
              <TabsTrigger value="configuration" className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5">
                Configuration
              </TabsTrigger>
              <TabsTrigger value="planning" disabled={!canAccessTabs} className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5">
                Planning
              </TabsTrigger>
              <TabsTrigger value="catalog" disabled={!canAccessTabs} className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5">
                Catalogue
              </TabsTrigger>
              <TabsTrigger value="resources" disabled={!canAccessTabs} className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5">
                Ressources
              </TabsTrigger>
              <TabsTrigger value="billing" disabled={!canAccessTabs} className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5">
                Facturation
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Tab content — flows naturally, main scrolls */}
          <div className="px-4 md:px-6 py-4">
            <Form {...form}>
              <form onSubmit={(e) => e.preventDefault()}>
                <TabsContent value="configuration" className="mt-0">
                  {/* Option 2: Horizontal sticky sub-nav */}
                  <VenueSectionNavBar sections={VENUE_CONFIG_SECTIONS} />

                  <VenueGeneralTab
                        form={form}
                        mode={isNewMode ? 'add' : 'edit'}
                        disabled={!isEditing}
                        hotelId={effectiveHotelId || undefined}
                        hotelImage={hotelImage}
                        coverImage={coverImage}
                        uploadingHotel={uploadingHotel}
                        uploadingCover={uploadingCover}
                        hotelImageRef={hotelImageRef}
                        coverImageRef={coverImageRef}
                        handleHotelImageUpload={handleHotelImageUpload}
                        handleCoverImageUpload={handleCoverImageUpload}
                        triggerHotelImageSelect={triggerHotelImageSelect}
                        triggerCoverImageSelect={triggerCoverImageSelect}
                        deploymentState={deploymentState}
                        onDeploymentStateChange={setDeploymentState}
                        blockedSlots={blockedSlots}
                        onBlockedSlotsChange={setBlockedSlots}
                      />
                </TabsContent>
              </form>
            </Form>

            <TabsContent value="planning" className="mt-0">
              {canAccessTabs ? (
                <VenueBookingCalendar
                  hotelId={effectiveHotelId!}
                  hotelName={hotelName || watchedName}
                />
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  Enregistrez le lieu pour accéder au planning
                </div>
              )}
            </TabsContent>

            {canAccessTabs && (
              <>
                <TabsContent value="catalog" className="mt-0">
                  <VenueCatalogTab
                    hotelId={effectiveHotelId!}
                    venueType={watchedVenueType}
                  />
                </TabsContent>

                <TabsContent value="resources" className="mt-0">
                  <VenueResourcesTab
                    hotelId={effectiveHotelId!}
                    hotelName={hotelName || watchedName}
                  />
                </TabsContent>

                <TabsContent value="billing" className="mt-0">
                  <VenueBillingTab hotelId={effectiveHotelId!} />
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      )}

      {canAccessTabs && (
        <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
          <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Aperçu client</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <VenueClientPreviewTab hotelId={effectiveHotelId!} slug={hotelSlug} />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
