import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useFileUpload } from "@/hooks/useFileUpload";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, ArrowRight } from "lucide-react";
import { VenueWizardStepper } from "./VenueWizardStepper";
import { VenueGeneralInfoStep } from "./steps/VenueGeneralInfoStep";
import { VenueDeploymentStep, DeploymentScheduleState } from "./steps/VenueDeploymentStep";

interface Trunk {
  id: string;
  name: string;
  trunk_id: string;
  image: string | null;
  hotel_id: string | null;
}

// Form schema for step 1
const createFormSchema = (t: TFunction) => z.object({
  name: z.string().min(1, t('errors.validation.nameRequired')),
  venue_type: z.enum(['hotel', 'coworking']).default('hotel'),
  address: z.string().min(1, t('errors.validation.addressRequired')),
  postal_code: z.string().optional(),
  city: z.string().min(1, t('errors.validation.cityRequired')),
  country: z.string().min(1, t('errors.validation.countryRequired')),
  currency: z.string().default("EUR"),
  vat: z.string().default("20"),
  hotel_commission: z.string().default("0"),
  hairdresser_commission: z.string().default("0"),
  status: z.string().default("active"),
  timezone: z.string().default("Europe/Paris"),
  opening_time: z.string().default("06:00"),
  closing_time: z.string().default("23:00"),
}).refine((data) => {
  const hotelComm = parseFloat(data.hotel_commission) || 0;
  const hairdresserComm = parseFloat(data.hairdresser_commission) || 0;
  return hotelComm + hairdresserComm <= 100;
}, {
  message: t('errors.validation.commissionExceeds100'),
  path: ["hotel_commission"],
}).refine((data) => {
  return data.opening_time < data.closing_time;
}, {
  message: "L'heure d'ouverture doit être avant l'heure de fermeture",
  path: ["closing_time"],
});

export type VenueWizardFormValues = z.infer<ReturnType<typeof createFormSchema>>;

interface VenueWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  mode: 'add' | 'edit';
  hotelId?: string;
}

export function VenueWizardDialog({
  open,
  onOpenChange,
  onSuccess,
  mode,
  hotelId,
}: VenueWizardDialogProps) {
  const { t } = useTranslation('common');
  const formSchema = useMemo(() => createFormSchema(t), [t]);

  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [trunks, setTrunks] = useState<Trunk[]>([]);
  const [selectedTrunkIds, setSelectedTrunkIds] = useState<string[]>([]);
  const [existingScheduleId, setExistingScheduleId] = useState<string | null>(null);

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
      hairdresser_commission: "0",
      status: "active",
      timezone: "Europe/Paris",
      opening_time: "06:00",
      closing_time: "23:00",
    },
  });

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setCurrentStep(1);
      fetchTrunks();
      if (mode === 'edit' && hotelId) {
        loadHotelData();
      } else {
        // Reset form for add mode
        form.reset();
        setHotelImage("");
        setCoverImage("");
        setSelectedTrunkIds([]);
        setDeploymentState({
          isAlwaysOpen: true,
          scheduleType: "specific_days",
          selectedDays: [],
          recurringStartDate: undefined,
          recurringEndDate: undefined,
          specificDates: [],
          recurrenceInterval: 1,
        });
        setExistingScheduleId(null);
      }
    }
  }, [open, mode, hotelId]);

  const fetchTrunks = async () => {
    const { data, error } = await supabase
      .from("trunks")
      .select("id, name, trunk_id, image, hotel_id")
      .order("name");

    if (error) {
      toast.error("Erreur lors du chargement des trunks");
      return;
    }

    setTrunks(data || []);
  };

  const loadHotelData = async () => {
    if (!hotelId) return;

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
          hairdresser_commission: hotel.hairdresser_commission?.toString() || "0",
          status: hotel.status || "active",
          timezone: hotel.timezone || "Europe/Paris",
          opening_time: hotel.opening_time?.substring(0, 5) || "06:00",
          closing_time: hotel.closing_time?.substring(0, 5) || "23:00",
        });

        setHotelImage(hotel.image || "");
        setCoverImage(hotel.cover_image || "");
      }

      // Load trunk associations
      const { data: trunkData } = await supabase
        .from("trunks")
        .select("id")
        .eq("hotel_id", hotelId);

      if (trunkData) {
        setSelectedTrunkIds(trunkData.map(t => t.id));
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
    } catch (error) {
      console.error("Error loading hotel data:", error);
      toast.error("Erreur lors du chargement des données");
    } finally {
      setLoading(false);
    }
  };

  const validateStep1 = async (): Promise<boolean> => {
    const result = await form.trigger([
      "name",
      "venue_type",
      "address",
      "postal_code",
      "city",
      "country",
      "currency",
      "vat",
      "hotel_commission",
      "hairdresser_commission",
      "status",
      "timezone",
    ]);
    return result;
  };

  const validateStep2 = async (): Promise<boolean> => {
    // Validate opening/closing time
    const timeValid = await form.trigger(["opening_time", "closing_time"]);
    if (!timeValid) return false;

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

  const handleNextStep = async () => {
    if (currentStep === 1) {
      const isValid = await validateStep1();
      if (isValid) {
        setCurrentStep(2);
      }
    }
  };

  const handlePreviousStep = () => {
    if (currentStep === 2) {
      setCurrentStep(1);
    }
  };

  const handleSubmit = async () => {
    // Validate step 2
    const step2Valid = await validateStep2();
    if (!step2Valid) return;

    // Validate step 1 as well (in case user went back and made invalid changes)
    const step1Valid = await validateStep1();
    if (!step1Valid) {
      setCurrentStep(1);
      return;
    }

    setSaving(true);
    try {
      const values = form.getValues();

      if (mode === 'add') {
        // Insert new hotel
        const { data: insertedHotel, error: hotelError } = await supabase
          .from("hotels")
          .insert({
            name: values.name,
            venue_type: values.venue_type,
            address: values.address,
            postal_code: values.postal_code || null,
            city: values.city,
            country: values.country,
            currency: values.currency,
            vat: parseFloat(values.vat),
            hotel_commission: parseFloat(values.hotel_commission),
            hairdresser_commission: parseFloat(values.hairdresser_commission),
            status: values.status,
            image: hotelImage || null,
            cover_image: coverImage || null,
            timezone: values.timezone,
            opening_time: values.opening_time + ':00',
            closing_time: values.closing_time + ':00',
          })
          .select('id')
          .single();

        if (hotelError) throw hotelError;

        const newHotelId = insertedHotel.id;

        // Associate trunks
        if (selectedTrunkIds.length > 0) {
          await supabase
            .from("trunks")
            .update({ hotel_id: newHotelId })
            .in("id", selectedTrunkIds);
        }

        // Insert deployment schedule
        await saveDeploymentSchedule(newHotelId);

        toast.success("Lieu créé avec succès");
      } else {
        // Update existing hotel
        const { error: hotelError } = await supabase
          .from("hotels")
          .update({
            name: values.name,
            venue_type: values.venue_type,
            address: values.address,
            postal_code: values.postal_code || null,
            city: values.city,
            country: values.country,
            currency: values.currency,
            vat: parseFloat(values.vat),
            hotel_commission: parseFloat(values.hotel_commission),
            hairdresser_commission: parseFloat(values.hairdresser_commission),
            status: values.status,
            image: hotelImage || null,
            cover_image: coverImage || null,
            timezone: values.timezone,
            opening_time: values.opening_time + ':00',
            closing_time: values.closing_time + ':00',
          })
          .eq("id", hotelId);

        if (hotelError) throw hotelError;

        // Update trunk associations
        // First, remove all trunk associations for this hotel
        await supabase
          .from("trunks")
          .update({ hotel_id: null })
          .eq("hotel_id", hotelId);

        // Then, add new associations
        if (selectedTrunkIds.length > 0) {
          await supabase
            .from("trunks")
            .update({ hotel_id: hotelId })
            .in("id", selectedTrunkIds);
        }

        // Update deployment schedule
        await saveDeploymentSchedule(hotelId!);

        toast.success("Lieu mis à jour avec succès");
      }

      onSuccess();
      onOpenChange(false);
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
      const { error } = await supabase
        .from("venue_deployment_schedules")
        .insert(schedulePayload);
      if (error) throw error;
    }
  };

  const dialogTitle = mode === 'add' ? 'Ajouter un lieu' : 'Modifier le lieu';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">{dialogTitle}</DialogTitle>
          <VenueWizardStepper currentStep={currentStep} />
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
              {currentStep === 1 && (
                <VenueGeneralInfoStep
                  form={form}
                  mode={mode}
                  trunks={trunks}
                  selectedTrunkIds={selectedTrunkIds}
                  setSelectedTrunkIds={setSelectedTrunkIds}
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
              )}

              {currentStep === 2 && (
                <VenueDeploymentStep
                  form={form}
                  state={deploymentState}
                  onChange={setDeploymentState}
                />
              )}

              <div className="flex justify-between gap-3 pt-4 border-t">
                {currentStep === 1 ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onOpenChange(false)}
                    >
                      Annuler
                    </Button>
                    <Button
                      type="button"
                      onClick={handleNextStep}
                      className="bg-foreground text-background hover:bg-foreground/90"
                    >
                      Suivant
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handlePreviousStep}
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Retour
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                      >
                        Annuler
                      </Button>
                      <Button
                        type="button"
                        onClick={handleSubmit}
                        disabled={saving}
                        className="bg-foreground text-background hover:bg-foreground/90"
                      >
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Enregistrer
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
