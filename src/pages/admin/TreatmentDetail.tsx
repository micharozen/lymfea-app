import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFileUpload } from "@/hooks/useFileUpload";
import { toast } from "sonner";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ArrowLeft, Loader2, Save, Pencil } from "lucide-react";
import { TreatmentGeneralTab } from "@/components/admin/treatment/TreatmentGeneralTab";
import { TreatmentVariantsTab } from "@/components/admin/treatment/TreatmentVariantsTab";
import { TreatmentAddonsTab } from "@/components/admin/treatment/TreatmentAddonsTab";

const createFormSchema = (t: TFunction) =>
  z.object({
    name: z.string().min(1, t("errors.validation.nameRequired")),
    name_en: z.string().optional(),
    description: z.string().optional(),
    description_en: z.string().optional(),
    lead_time: z.string().default("0"),
    service_for: z.string().min(1, t("errors.validation.serviceForRequired")),
    category: z.string().min(1, t("errors.validation.categoryRequired")),
    hotel_id: z.string().min(1, t("errors.validation.hotelRequired")),
    status: z.string().default("active"),
    sort_order: z.string().default("0"),
    is_bestseller: z.boolean().default(false),
    is_addon: z.boolean().default(false),
    addon_ids: z.array(z.string().uuid()).default([]),
    specialty: z.string().optional(),
    variants: z
      .array(
        z.object({
          label: z.string().optional(),
          label_en: z.string().optional(),
          duration: z.string().min(1, "Durée requise"),
          price: z.string().default("0"),
          price_on_request: z.boolean().default(false),
          is_default: z.boolean().default(false),
        })
      )
      .min(1, "Au moins une variante requise"),
  });

export type TreatmentFormValues = z.infer<ReturnType<typeof createFormSchema>>;

export default function TreatmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const formSchema = useMemo(() => createFormSchema(t), [t]);

  const isNewMode = !id;
  const [savedTreatmentId, setSavedTreatmentId] = useState<string | null>(
    id || null
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [treatmentName, setTreatmentName] = useState("");
  const [isEditingState, setIsEditingState] = useState(false);
  const isEditing = isNewMode || isEditingState;

  const {
    url: menuImage,
    setUrl: setMenuImage,
    uploading: isUploading,
    fileInputRef,
    handleUpload: handleImageUpload,
    triggerFileSelect,
  } = useFileUpload({ path: "treatment-menus/" });

  const form = useForm<TreatmentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      lead_time: "0",
      service_for: "",
      category: "",
      hotel_id: "",
      status: "active",
      sort_order: "0",
      is_bestseller: false,
      is_addon: false,
      addon_ids: [],
      specialty: "",
      variants: [
        {
          label: "",
          duration: "",
          price: "0",
          price_on_request: false,
          is_default: true,
        },
      ],
    },
  });

  const { data: hotels } = useQuery({
    queryKey: ["hotels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotels")
        .select("id, name, currency")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const loadTreatmentData = useCallback(
    async (treatmentId: string) => {
      setLoading(true);
      try {
        const { data: treatment, error } = await supabase
          .from("treatment_menus")
          .select("*")
          .eq("id", treatmentId)
          .single();

        if (error) throw error;

        if (treatment) {
          // Load variants
          const { data: existingVariants } = await supabase
            .from("treatment_variants")
            .select("*")
            .eq("treatment_id", treatmentId)
            .order("sort_order");

          const variantsData =
            existingVariants && existingVariants.length > 0
              ? existingVariants.map((v) => ({
                  label: v.label || "",
                  label_en: (v as any).label_en || "",
                  duration: v.duration?.toString() || "0",
                  price: v.price?.toString() || "0",
                  price_on_request: v.price_on_request || false,
                  is_default: v.is_default || false,
                }))
              : [
                  {
                    label: "",
                    duration: treatment.duration?.toString() || "0",
                    price: treatment.price?.toString() || "0",
                    price_on_request: treatment.price_on_request || false,
                    is_default: true,
                  },
                ];

          // Load linked add-ons
          const { data: existingAddonLinks } = await supabase
            .from("treatment_addons")
            .select("addon_treatment_id")
            .eq("parent_treatment_id", treatmentId);

          const addonIds = (existingAddonLinks ?? []).map(
            (row) => row.addon_treatment_id
          );

          form.reset({
            name: treatment.name || "",
            name_en: (treatment as any).name_en || "",
            description: treatment.description || "",
            description_en: (treatment as any).description_en || "",
            lead_time: treatment.lead_time?.toString() || "0",
            service_for: treatment.service_for || "",
            category: treatment.category || "",
            hotel_id: treatment.hotel_id || "",
            status: treatment.status || "active",
            sort_order: treatment.sort_order?.toString() || "0",
            is_bestseller: treatment.is_bestseller || false,
            is_addon: treatment.is_addon ?? false,
            addon_ids: addonIds,
            specialty: treatment.treatment_type || "",
            variants: variantsData,
          });

          setMenuImage(treatment.image || "");
          setTreatmentName(treatment.name || "");
        }
      } catch (error) {
        console.error("Error loading treatment data:", error);
        toast.error("Erreur lors du chargement du soin");
      } finally {
        setLoading(false);
      }
    },
    [form, setMenuImage]
  );

  useEffect(() => {
    if (id) {
      loadTreatmentData(id);
    }
  }, [id, loadTreatmentData]);

  const handleSave = async () => {
    const isValid = await form.trigger();
    if (!isValid) {
      const errors = form.formState.errors;
      const missingFields: string[] = [];
      if (errors.name) missingFields.push("Nom du soin");
      if (errors.hotel_id) missingFields.push("Hôtel");
      if (errors.category) missingFields.push("Catégorie");
      if (errors.service_for) missingFields.push("Service pour");
      if (errors.variants) missingFields.push("Variantes");
      toast.error(
        missingFields.length > 0
          ? `Champs requis manquants : ${missingFields.join(", ")}`
          : "Veuillez corriger les erreurs du formulaire"
      );
      setActiveTab("general");
      return;
    }

    setSaving(true);
    try {
      const values = form.getValues();
      const selectedHotel = hotels?.find((h) => h.id === values.hotel_id);
      const currency = selectedHotel?.currency || "EUR";
      const defaultVariant =
        values.variants.find((v) => v.is_default) || values.variants[0];

      const treatmentPayload = {
        name: values.name,
        name_en: values.name_en || null,
        description: values.description || null,
        description_en: values.description_en || null,
        duration: parseInt(defaultVariant.duration),
        price: parseFloat(defaultVariant.price),
        lead_time: parseInt(values.lead_time),
        service_for: values.service_for,
        category: values.category,
        hotel_id: values.hotel_id,
        currency,
        image: menuImage || null,
        status: values.status,
        sort_order: parseInt(values.sort_order),
        price_on_request: defaultVariant.price_on_request,
        is_bestseller: values.is_bestseller,
        is_addon: values.is_addon,
        treatment_type: values.specialty || null,
      };

      // An add-on cannot itself have sub-add-ons — clear links if toggled on
      const addonIdsToPersist = values.is_addon ? [] : values.addon_ids ?? [];

      if (isNewMode && !savedTreatmentId) {
        // INSERT
        const { data: newTreatment, error } = await supabase
          .from("treatment_menus")
          .insert(treatmentPayload)
          .select("id")
          .single();

        if (error || !newTreatment) throw error;

        // Insert variants
        const variantsToInsert = values.variants.map((v, index) => ({
          treatment_id: newTreatment.id,
          label: v.label || `${v.duration} min`,
          label_en: v.label_en || null,
          duration: parseInt(v.duration),
          price: parseFloat(v.price),
          price_on_request: v.price_on_request,
          is_default: v.is_default,
          sort_order: index,
        }));

        const { error: variantsError } = await supabase
          .from("treatment_variants")
          .insert(variantsToInsert);

        if (variantsError) throw variantsError;

        if (addonIdsToPersist.length > 0) {
          const addonsToInsert = addonIdsToPersist.map((addonId, index) => ({
            parent_treatment_id: newTreatment.id,
            addon_treatment_id: addonId,
            sort_order: index,
          }));
          const { error: addonsError } = await supabase
            .from("treatment_addons")
            .insert(addonsToInsert);
          if (addonsError) throw addonsError;
        }

        setSavedTreatmentId(newTreatment.id);
        setTreatmentName(values.name);
        toast.success("Soin créé avec succès");
        navigate(`/admin/treatments/${newTreatment.id}`, { replace: true });
      } else {
        // UPDATE
        const targetId = savedTreatmentId || id!;

        const { error } = await supabase
          .from("treatment_menus")
          .update(treatmentPayload)
          .eq("id", targetId);

        if (error) throw error;

        // Delete old variants and re-insert
        const { error: deleteError } = await supabase
          .from("treatment_variants")
          .delete()
          .eq("treatment_id", targetId);

        if (deleteError) throw deleteError;

        const variantsToInsert = values.variants.map((v, index) => ({
          treatment_id: targetId,
          label: v.label || `${v.duration} min`,
          label_en: v.label_en || null,
          duration: parseInt(v.duration),
          price: parseFloat(v.price),
          price_on_request: v.price_on_request,
          is_default: v.is_default,
          sort_order: index,
        }));

        const { error: variantsError } = await supabase
          .from("treatment_variants")
          .insert(variantsToInsert);

        if (variantsError) throw variantsError;

        // Sync addon links — delete then re-insert
        const { error: deleteAddonsError } = await supabase
          .from("treatment_addons")
          .delete()
          .eq("parent_treatment_id", targetId);
        if (deleteAddonsError) throw deleteAddonsError;

        if (addonIdsToPersist.length > 0) {
          const addonsToInsert = addonIdsToPersist.map((addonId, index) => ({
            parent_treatment_id: targetId,
            addon_treatment_id: addonId,
            sort_order: index,
          }));
          const { error: addonsError } = await supabase
            .from("treatment_addons")
            .insert(addonsToInsert);
          if (addonsError) throw addonsError;
        }

        setTreatmentName(values.name);
        toast.success("Soin mis à jour avec succès");
        setIsEditingState(false);
      }
    } catch (error: any) {
      console.error("Error saving treatment:", error);
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = async () => {
    if (id) {
      await loadTreatmentData(id);
    }
    setIsEditingState(false);
  };

  const effectiveTreatmentId = savedTreatmentId || id || null;
  const canAccessTabs = !!effectiveTreatmentId;

  const watchedName = form.watch("name");

  return (
    <div className="bg-background">
      {/* Header — sticky */}
      <div className="border-b bg-background sticky top-0 z-10">
        <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/admin/treatments")}
              className="flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Retour</span>
            </Button>
            <div className="h-5 w-px bg-border flex-shrink-0" />
            <h1 className="text-lg font-medium truncate">
              {isNewMode && !savedTreatmentId
                ? "Nouveau soin"
                : watchedName || treatmentName || "Soin"}
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
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
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
          <div className="px-4 md:px-6 pt-4 bg-background sticky top-[57px] z-[9]">
            <TabsList className="w-full justify-start overflow-x-auto bg-transparent rounded-none border-b p-0 h-auto">
              <TabsTrigger
                value="general"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5"
              >
                Général
              </TabsTrigger>
              <TabsTrigger
                value="variants"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5"
              >
                Variantes
              </TabsTrigger>
              <TabsTrigger
                value="addons"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5"
              >
                Add-ons
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="px-4 md:px-6 py-4">
            <Form {...form}>
              <form onSubmit={(e) => e.preventDefault()}>
                <TabsContent value="general" className="mt-0">
                  <TreatmentGeneralTab
                    form={form}
                    disabled={!isEditing}
                    menuImage={menuImage}
                    isUploading={isUploading}
                    fileInputRef={fileInputRef as React.RefObject<HTMLInputElement>}
                    handleImageUpload={handleImageUpload}
                    triggerFileSelect={triggerFileSelect}
                  />
                </TabsContent>

                <TabsContent value="variants" className="mt-0">
                  <TreatmentVariantsTab form={form} disabled={!isEditing} />
                </TabsContent>

                <TabsContent value="addons" className="mt-0">
                  <TreatmentAddonsTab
                    form={form}
                    disabled={!isEditing}
                    currentTreatmentId={effectiveTreatmentId}
                  />
                </TabsContent>
              </form>
            </Form>
          </div>
        </Tabs>
      )}
    </div>
  );
}
