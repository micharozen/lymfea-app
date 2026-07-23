import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { useSetTherapistTreatments } from "@/hooks/useTherapistTreatments";
import { toast } from "sonner";
import { useFileUpload } from "@/hooks/useFileUpload";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Loader2, Save, Pencil, Send } from "lucide-react";
import { TherapistGeneralTab } from "@/components/admin/therapist/TherapistGeneralTab";
import { TherapistAssignmentsTab } from "@/components/admin/therapist/TherapistAssignmentsTab";
import { TherapistScheduleSection } from "@/components/admin/schedule/TherapistScheduleSection";
import { TherapistActivityTab } from "@/components/admin/therapist/TherapistActivityTab";
import { TherapistBillingTab } from "@/components/admin/therapist/TherapistBillingTab";
import { TherapistBookingsTab } from "@/components/admin/therapist/TherapistBookingsTab";

const createFormSchema = (t: TFunction) =>
  z.object({
    first_name: z.string().min(1, t("admin:therapists.firstNameRequired", "Le prénom est requis")),
    last_name: z.string().min(1, t("admin:therapists.lastNameRequired", "Le nom est requis")),
    email: z.string().email(t("admin:therapists.emailInvalid", "Email invalide")),
    country_code: z.string().default("+33"),
    phone: z.string().min(1, t("admin:therapists.phoneRequired", "Le téléphone est requis")),
    status: z.string().default("En attente"),
    gender: z.enum(["female", "male", ""]).optional().default(""),
    rate_75: z
      .string()
      .min(1, t("admin:therapists.rateRequired", "Tarif requis"))
      .refine((v) => parseFloat(v) > 0, t("admin:therapists.rateMustBePositive", "Le tarif doit être > 0")),
    rate_60: z
      .string()
      .min(1, t("admin:therapists.rateRequired", "Tarif requis"))
      .refine((v) => parseFloat(v) > 0, t("admin:therapists.rateMustBePositive", "Le tarif doit être > 0")),
    rate_90: z
      .string()
      .min(1, t("admin:therapists.rateRequired", "Tarif requis"))
      .refine((v) => parseFloat(v) > 0, t("admin:therapists.rateMustBePositive", "Le tarif doit être > 0")),
    // Extra brackets — optional, but must be > 0 when provided.
    rate_45: z
      .string()
      .optional()
      .refine((v) => !v || parseFloat(v) > 0, t("admin:therapists.rateMustBePositive", "Le tarif doit être > 0")),
    rate_105: z
      .string()
      .optional()
      .refine((v) => !v || parseFloat(v) > 0, t("admin:therapists.rateMustBePositive", "Le tarif doit être > 0")),
    rate_120: z
      .string()
      .optional()
      .refine((v) => !v || parseFloat(v) > 0, t("admin:therapists.rateMustBePositive", "Le tarif doit être > 0")),
    rate_150: z
      .string()
      .optional()
      .refine((v) => !v || parseFloat(v) > 0, t("admin:therapists.rateMustBePositive", "Le tarif doit être > 0")),
  });

export type TherapistFormValues = z.infer<ReturnType<typeof createFormSchema>>;

export default function TherapistDetail() {
  const { mutateAsync: setTherapistTreatments } = useSetTherapistTreatments();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const formSchema = useMemo(() => createFormSchema(t), [t]);

  const isNewMode = !id;
  const [savedTherapistId, setSavedTherapistId] = useState<string | null>(id || null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [therapistName, setTherapistName] = useState("");
  const [isEditingState, setIsEditingState] = useState(false);
  const isEditing = isNewMode || isEditingState;

  // Separate state for relational / JSON data
  const [selectedHotels, setSelectedHotels] = useState<string[]>([]);
  const [selectedTreatmentIds, setSelectedTreatmentIds] = useState<string[]>([]);
  const [minimumGuarantee, setMinimumGuarantee] = useState<Record<string, number>>({});
  const [minimumGuaranteeActive, setMinimumGuaranteeActive] = useState(false);
  const [resending, setResending] = useState(false);

  const {
    url: profileImage,
    setUrl: setProfileImage,
    uploading,
    fileInputRef,
    handleUpload: handleImageUpload,
    triggerFileSelect,
  } = useFileUpload();

  const form = useForm<TherapistFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      country_code: "+33",
      phone: "",
      status: "En attente",
      gender: "",
      rate_45: "",
      rate_105: "",
      rate_120: "",
      rate_150: "",
    },
  });

  useEffect(() => {
    if (id) {
      loadTherapistData(id);
    }
  }, [id]);

  const loadTherapistData = async (therapistId: string) => {
    setLoading(true);
    try {
      const { data: therapist, error } = await supabase
        .from("therapists")
        .select("*")
        .eq("id", therapistId)
        .single();

      if (error) throw error;

      const { data: therapistTreatments, error: treatmentsError } = await supabase
        .from("therapist_treatments")
        .select("treatment_menu_id")
        .eq("therapist_id", therapistId);
      if (treatmentsError) throw treatmentsError;

      if (therapist) {
        form.reset({
          first_name: therapist.first_name || "",
          last_name: therapist.last_name || "",
          email: therapist.email || "",
          country_code: therapist.country_code || "+33",
          phone: therapist.phone || "",
          status: therapist.status || "En attente",
          gender: therapist.gender || "",
          rate_75: therapist.rate_75?.toString() || "",
          rate_60: therapist.rate_60?.toString() || "",
          rate_90: therapist.rate_90?.toString() || "",
          rate_45: therapist.rate_45?.toString() || "",
          rate_105: therapist.rate_105?.toString() || "",
          rate_120: therapist.rate_120?.toString() || "",
          rate_150: therapist.rate_150?.toString() || "",
        });

        setProfileImage(therapist.profile_image || "");
        setTherapistName(`${therapist.first_name} ${therapist.last_name}`);
        setSelectedTreatmentIds(
          (therapistTreatments ?? []).map((row) => row.treatment_menu_id)
        );
        setMinimumGuarantee(
          (therapist.minimum_guarantee as Record<string, number>) || {}
        );
        setMinimumGuaranteeActive(therapist.minimum_guarantee_active || false);
      }

      // Load venue assignments
      const { data: venues } = await supabase
        .from("therapist_venues")
        .select("hotel_id")
        .eq("therapist_id", therapistId);

      setSelectedHotels(venues?.map((v) => v.hotel_id) || []);
    } catch (error) {
      console.error("Error loading therapist data:", error);
      toast.error("Erreur lors du chargement des données");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const isValid = await form.trigger();
    if (!isValid) {
      setActiveTab("general");
      return;
    }

    setSaving(true);
    try {
      const values = form.getValues();

      const therapistPayload = {
        first_name: values.first_name,
        last_name: values.last_name,
        email: values.email,
        country_code: values.country_code,
        phone: values.phone,
        status: values.status,
        gender: values.gender || null,
        profile_image: profileImage || null,
        minimum_guarantee:
          Object.keys(minimumGuarantee).length > 0 ? minimumGuarantee : null,
        minimum_guarantee_active: minimumGuaranteeActive,
        rate_75: parseFloat(values.rate_75),
        rate_60: parseFloat(values.rate_60),
        rate_90: parseFloat(values.rate_90),
        rate_45: values.rate_45 ? parseFloat(values.rate_45) : null,
        rate_105: values.rate_105 ? parseFloat(values.rate_105) : null,
        rate_120: values.rate_120 ? parseFloat(values.rate_120) : null,
        rate_150: values.rate_150 ? parseFloat(values.rate_150) : null,
      };

      if (isNewMode && !savedTherapistId) {
        // INSERT new therapist
        const { data: inserted, error } = await supabase
          .from("therapists")
          .insert(therapistPayload)
          .select("id")
          .single();

        if (error) throw error;

        const newId = inserted.id;
        setSavedTherapistId(newId);
        setTherapistName(`${values.first_name} ${values.last_name}`);

        // Save venue relationships
        if (selectedHotels.length > 0) {
          const { error: relError } = await supabase
            .from("therapist_venues")
            .insert(
              selectedHotels.map((hotelId) => ({
                therapist_id: newId,
                hotel_id: hotelId,
              }))
            );
          if (relError) throw relError;
        }

        await setTherapistTreatments({
          therapistId: newId,
          treatmentMenuIds: selectedTreatmentIds,
        });

        // Send invite email
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData.session) {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            await fetch(`${supabaseUrl}/functions/v1/invite-therapist`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionData.session.access_token}`,
              },
              body: JSON.stringify({
                therapistEmail: values.email,
                therapistName: `${values.first_name} ${values.last_name}`,
              }),
            });
          }
        } catch (emailErr) {
          console.error("Error invoking invite-therapist:", emailErr);
          toast.warning(
            "Thérapeute créé mais l'email de bienvenue n'a pas pu être envoyé"
          );
        }

        toast.success(
          t("admin:therapists.createSuccess", "Thérapeute créé avec succès")
        );
        navigate(`/admin/therapists/${newId}`, { replace: true });
      } else {
        // UPDATE existing therapist
        const targetId = savedTherapistId || id!;

        const { error } = await supabase
          .from("therapists")
          .update(therapistPayload)
          .eq("id", targetId);

        if (error) throw error;

        setTherapistName(`${values.first_name} ${values.last_name}`);

        // Delete and re-insert venue relationships
        await supabase
          .from("therapist_venues")
          .delete()
          .eq("therapist_id", targetId);

        if (selectedHotels.length > 0) {
          const { error: relError } = await supabase
            .from("therapist_venues")
            .insert(
              selectedHotels.map((hotelId) => ({
                therapist_id: targetId,
                hotel_id: hotelId,
              }))
            );
          if (relError) throw relError;
        }

        await setTherapistTreatments({
          therapistId: targetId,
          treatmentMenuIds: selectedTreatmentIds,
        });

        toast.success(
          t("admin:therapists.saveSuccess", "Thérapeute enregistré avec succès")
        );
        setIsEditingState(false);
      }
    } catch (error: any) {
      console.error("Error saving therapist:", error);
      if (error.code === "23505") {
        toast.error("Un thérapeute avec cet email existe déjà");
      } else {
        toast.error("Erreur lors de l'enregistrement");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = async () => {
    if (id) {
      await loadTherapistData(id);
    }
    setIsEditingState(false);
  };

  const effectiveTherapistId = savedTherapistId || id || null;

  const handleResendInvite = async () => {
    if (!effectiveTherapistId) return;
    setResending(true);
    try {
      const values = form.getValues();
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        toast.error("Session expirée, veuillez vous reconnecter");
        return;
      }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/invite-therapist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({
          therapistId: effectiveTherapistId,
          email: values.email,
          firstName: values.first_name,
          lastName: values.last_name,
          phone: values.phone,
          countryCode: values.country_code,
          hotelIds: selectedHotels,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Erreur lors de l'envoi");
      }
      toast.success(t("admin:therapists.inviteResent", "Invitation renvoyée avec succès"));
    } catch (error: unknown) {
      console.error("Error resending invite:", error);
      toast.error("Erreur lors du renvoi de l'invitation");
    } finally {
      setResending(false);
    }
  };
  const canAccessTabs = !!effectiveTherapistId;

  const watchedStatus = form.watch("status");
  const isActive = watchedStatus === "active" || watchedStatus === "Actif";
  const showResendInvite = !isNewMode && !isActive && effectiveTherapistId;

  const watchedFirstName = form.watch("first_name");
  const watchedLastName = form.watch("last_name");
  const watchedName =
    watchedFirstName || watchedLastName
      ? `${watchedFirstName} ${watchedLastName}`.trim()
      : "";

  return (
    <div className="bg-background">
      {/* Header — sticky */}
      <div className="border-b bg-background sticky top-0 z-10">
        <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">
                {t("admin:therapists.back", "Retour")}
              </span>
            </Button>
            <div className="h-5 w-px bg-border flex-shrink-0" />
            <h1 className="text-lg font-medium truncate">
              {isNewMode && !savedTherapistId
                ? t("admin:therapists.newTherapist", "Nouveau thérapeute")
                : watchedName || therapistName || "Thérapeute"}
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isNewMode ? (
              <Button
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {t("common:save", "Enregistrer")}
              </Button>
            ) : isEditing ? (
              <>
                <Button
                  variant="outline"
                  onClick={handleCancelEdit}
                  disabled={saving}
                >
                  {t("common:cancel", "Annuler")}
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {t("common:save", "Enregistrer")}
                </Button>
              </>
            ) : (
              <>
                {showResendInvite && (
                  <Button
                    variant="outline"
                    onClick={handleResendInvite}
                    disabled={resending}
                  >
                    {resending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    {t("admin:therapists.resendInvite", "Renvoyer l'invitation")}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => setIsEditingState(true)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  {t("common:edit", "Modifier")}
                </Button>
              </>
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
          <div className="px-4 md:px-6 pt-4 bg-background sticky top-[57px] z-[9]">
            <TabsList className="w-full justify-start overflow-x-auto bg-transparent rounded-none border-b p-0 h-auto">
              <TabsTrigger
                value="general"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5"
              >
                {t("admin:therapists.general", "Général")}
              </TabsTrigger>
              <TabsTrigger
                value="assignments"
                disabled={!canAccessTabs}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5"
              >
                {t("admin:therapists.assignments", "Affectations")}
              </TabsTrigger>
              <TabsTrigger
                value="planning"
                disabled={!canAccessTabs}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5"
              >
                {t("admin:therapists.planning", "Planning")}
              </TabsTrigger>
              <TabsTrigger
                value="activity"
                disabled={!canAccessTabs}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5"
              >
                {t("admin:therapists.activity", "Activité")}
              </TabsTrigger>
              <TabsTrigger
                value="bookings"
                disabled={!canAccessTabs}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5"
              >
                {t("admin:therapists.bookings", "Réservations")}
              </TabsTrigger>
              <TabsTrigger
                value="billing"
                disabled={!canAccessTabs}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5"
              >
                {t("admin:therapists.billing", "Facturation")}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="px-4 md:px-6 py-4">
            <Form {...form}>
              <TabsContent value="general" className="mt-0">
                <TherapistGeneralTab
                  form={form}
                  disabled={!isEditing}
                  profileImage={profileImage || ""}
                  uploading={uploading}
                  fileInputRef={fileInputRef}
                  handleImageUpload={handleImageUpload}
                  triggerFileSelect={triggerFileSelect}
                  therapistId={effectiveTherapistId}
                />
              </TabsContent>
            </Form>

            {canAccessTabs && (
              <>
                <TabsContent value="assignments" className="mt-0">
                  <TherapistAssignmentsTab
                    disabled={!isEditing}
                    selectedHotels={selectedHotels}
                    onHotelsChange={setSelectedHotels}
                    selectedTreatmentIds={selectedTreatmentIds}
                    onTreatmentsChange={setSelectedTreatmentIds}
                    minimumGuarantee={minimumGuarantee}
                    onMinimumGuaranteeChange={setMinimumGuarantee}
                    minimumGuaranteeActive={minimumGuaranteeActive}
                    onMinimumGuaranteeActiveChange={setMinimumGuaranteeActive}
                  />
                </TabsContent>

                <TabsContent value="planning" className="mt-0">
                  <TherapistScheduleSection
                    therapistId={effectiveTherapistId!}
                  />
                </TabsContent>

                <TabsContent value="activity" className="mt-0">
                  <TherapistActivityTab therapistId={effectiveTherapistId!} />
                </TabsContent>

                <TabsContent value="bookings" className="mt-0">
                  <TherapistBookingsTab therapistId={effectiveTherapistId!} />
                </TabsContent>

                <TabsContent value="billing" className="mt-0">
                  <TherapistBillingTab therapistId={effectiveTherapistId!} />
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      )}
    </div>
  );
}
