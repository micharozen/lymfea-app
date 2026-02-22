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
import { format } from "date-fns";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Loader2, Save, Pencil } from "lucide-react";
import { VenueGeneralTab } from "@/components/admin/venue/VenueGeneralTab";
import { VenueDeploymentTab } from "@/components/admin/venue/VenueDeploymentTab";
import { VenueTreatmentRoomsTab } from "@/components/admin/venue/VenueTreatmentRoomsTab";
import { VenueTherapistsTab } from "@/components/admin/venue/VenueTherapistsTab";
import { VenueCategoriesStep } from "@/components/admin/steps/VenueCategoriesStep";
import { VenueClientPreviewTab } from "@/components/admin/venue/VenueClientPreviewTab";
import { DeploymentScheduleState } from "@/components/admin/steps/VenueDeploymentStep";
import type { VenueWizardFormValues, BlockedSlot } from "@/components/admin/VenueWizardDialog";

// Same form schema as VenueWizardDialog
const createFormSchema = (t: TFunction) => z.object({
  name: z.string().min(1, t('errors.validation.nameRequired')),
  venue_type: z.enum(['hotel', 'coworking', 'enterprise']).default('hotel'),
  address: z.string().min(1, t('errors.validation.addressRequired')),
  postal_code: z.string().optional(),
  city: z.string().min(1, t('errors.validation.cityRequired')),
  country: z.string().min(1, t('errors.validation.countryRequired')),
  currency: z.string().default("EUR"),
  vat: z.string().default("20"),
  hotel_commission: z.string().default("0"),
  therapist_commission: z.string().default("0"),
  status: z.string().default("active"),
  timezone: z.string().default("Europe/Paris"),
  opening_time: z.string().default("06:00"),
  closing_time: z.string().default("23:00"),
  slot_interval: z.number().default(30),
  auto_validate_bookings: z.boolean().default(false),
  offert: z.boolean().default(false),
  company_offered: z.boolean().default(false),
  landing_subtitle: z.string().optional(),
}).refine((data) => {
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
  const [activeTab, setActiveTab] = useState("general");
  const [existingScheduleId, setExistingScheduleId] = useState<string | null>(null);
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [hotelName, setHotelName] = useState("");
  const [isEditingState, setIsEditingState] = useState(false);
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
      venue_type: "hotel",
      address: "",
      postal_code: "",
      city: "",
      country: "",
      currency: "EUR",
      vat: "20",
      hotel_commission: "0",
      therapist_commission: "0",
      status: "active",
      timezone: "Europe/Paris",
      opening_time: "06:00",
      closing_time: "23:00",
      slot_interval: 30,
      auto_validate_bookings: false,
      offert: false,
      company_offered: false,
      landing_subtitle: "",
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
          venue_type: hotel.venue_type || "hotel",
          address: hotel.address || "",
          postal_code: hotel.postal_code || "",
          city: hotel.city || "",
          country: hotel.country || "",
          currency: hotel.currency || "EUR",
          vat: hotel.vat?.toString() || "20",
          hotel_commission: hotel.hotel_commission?.toString() || "0",
          therapist_commission: hotel.therapist_commission?.toString() || "0",
          status: hotel.status || "active",
          timezone: hotel.timezone || "Europe/Paris",
          opening_time: hotel.opening_time?.substring(0, 5) || "06:00",
          closing_time: hotel.closing_time?.substring(0, 5) || "23:00",
          slot_interval: hotel.slot_interval || 30,
          auto_validate_bookings: hotel.auto_validate_bookings || false,
          offert: hotel.offert || false,
          company_offered: hotel.company_offered || false,
          landing_subtitle: (hotel as any).landing_subtitle || "",
        });

        setHotelImage(hotel.image || "");
        setCoverImage(hotel.cover_image || "");
        setHotelName(hotel.name || "");
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
      setActiveTab("general");
      return;
    }

    // Validate deployment
    if (!validateDeployment()) {
      setActiveTab("planning");
      return;
    }

    setSaving(true);
    try {
      const values = form.getValues();

      const hotelPayload = {
        name: values.name,
        venue_type: values.venue_type,
        address: values.address,
        postal_code: values.postal_code || null,
        city: values.city,
        country: values.country,
        currency: values.currency,
        vat: parseFloat(values.vat),
        hotel_commission: parseFloat(values.hotel_commission),
        therapist_commission: parseFloat(values.therapist_commission),
        status: values.status,
        image: hotelImage || null,
        cover_image: coverImage || null,
        timezone: values.timezone,
        opening_time: values.opening_time + ':00',
        closing_time: values.closing_time + ':00',
        slot_interval: values.slot_interval,
        auto_validate_bookings: values.auto_validate_bookings,
        offert: values.offert,
        company_offered: values.company_offered,
        landing_subtitle: values.landing_subtitle || null,
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

  // Watch name for header display
  const watchedName = form.watch("name");

  return (
    <div className="bg-background min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-background sticky top-0 z-10">
        <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/admin/places')}
              className="flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Retour</span>
            </Button>
            <h1 className="text-lg font-semibold truncate">
              {isNewMode && !savedHotelId
                ? "Nouveau lieu"
                : watchedName || hotelName || "Lieu"}
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isNewMode ? (
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-foreground text-background hover:bg-foreground/90"
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
                  className="bg-foreground text-background hover:bg-foreground/90"
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
        <div className="flex-1 px-4 md:px-6 py-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start overflow-x-auto mb-6">
              <TabsTrigger value="general">Général</TabsTrigger>
              <TabsTrigger value="planning">Planning</TabsTrigger>
              <TabsTrigger value="rooms" disabled={!canAccessTabs}>
                Salles
              </TabsTrigger>
              <TabsTrigger value="therapists" disabled={!canAccessTabs}>
                Thérapeutes
              </TabsTrigger>
              <TabsTrigger value="categories" disabled={!canAccessTabs}>
                Catégories
              </TabsTrigger>
              <TabsTrigger value="client-preview" disabled={!canAccessTabs}>
                Aperçu client
              </TabsTrigger>
            </TabsList>

            <Form {...form}>
              <form onSubmit={(e) => e.preventDefault()}>
                <TabsContent value="general" className="mt-0">
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
                  />
                </TabsContent>

                <TabsContent value="planning" className="mt-0">
                  <VenueDeploymentTab
                    form={form}
                    state={deploymentState}
                    onChange={setDeploymentState}
                    blockedSlots={blockedSlots}
                    onBlockedSlotsChange={setBlockedSlots}
                    disabled={!isEditing}
                  />
                </TabsContent>
              </form>
            </Form>

            {canAccessTabs && (
              <>
                <TabsContent value="rooms" className="mt-0">
                  <VenueTreatmentRoomsTab
                    hotelId={effectiveHotelId!}
                    hotelName={hotelName || watchedName}
                  />
                </TabsContent>

                <TabsContent value="therapists" className="mt-0">
                  <VenueTherapistsTab hotelId={effectiveHotelId!} />
                </TabsContent>

                <TabsContent value="categories" className="mt-0">
                  <VenueCategoriesStep hotelId={effectiveHotelId} />
                </TabsContent>

                <TabsContent value="client-preview" className="mt-0">
                  <VenueClientPreviewTab hotelId={effectiveHotelId!} />
                </TabsContent>
              </>
            )}
          </Tabs>
        </div>
      )}
    </div>
  );
}
