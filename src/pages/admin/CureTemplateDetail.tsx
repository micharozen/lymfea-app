import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Loader2, Save, Pencil } from "lucide-react";
import { CategorySelectField } from "@/components/admin/category/CategorySelectField";

const formSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  name_en: z.string().optional(),
  description: z.string().optional(),
  description_en: z.string().optional(),
  hotel_id: z.string().min(1, "Le lieu est requis"),
  total_sessions: z.coerce.number().int().min(1, "Minimum 1 seance"),
  price: z.coerce.number().min(0, "Le prix doit etre positif"),
  validity_days: z.coerce.number().int().min(1).default(365),
  status: z.enum(["active", "inactive"]).default("active"),
  category: z.string().min(1, "La catégorie est requise"),
  eligible_treatment_ids: z.array(z.string()).default([]),
});

type FormValues = z.infer<typeof formSchema>;

export default function CureTemplateDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();

  const isNewMode = !id;
  const [loading, setLoading] = useState(false);
  const [isEditingState, setIsEditingState] = useState(false);
  const isEditing = isNewMode || isEditingState;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      name_en: "",
      description: "",
      description_en: "",
      hotel_id: "",
      total_sessions: 5,
      price: 0,
      validity_days: 365,
      status: "active",
      category: "",
      eligible_treatment_ids: [],
    },
  });

  const watchedHotelId = form.watch("hotel_id");
  const watchedName = form.watch("name");

  // Fetch hotels
  const { data: hotels } = useQuery({
    queryKey: ["hotels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotels")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch treatments filtered by hotel
  const { data: treatments } = useQuery({
    queryKey: ["treatments-for-bundle", watchedHotelId],
    queryFn: async () => {
      if (!watchedHotelId) return [];
      const { data, error } = await supabase
        .from("treatment_menus")
        .select("id, name, category")
        .eq("hotel_id", watchedHotelId)
        .eq("status", "active")
        .is("is_bundle", false)
        .order("category")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!watchedHotelId,
  });

  // Load existing bundle
  useEffect(() => {
    if (id) {
      loadBundle(id);
    }
  }, [id]);

  const loadBundle = async (bundleId: string) => {
    setLoading(true);
    try {
      const { data: bundle, error } = await supabase
        .from("treatment_bundles")
        .select("*")
        .eq("id", bundleId)
        .single();
      if (error) throw error;

      const { data: items } = await supabase
        .from("treatment_bundle_items")
        .select("treatment_id")
        .eq("bundle_id", bundleId);

      // Get category from the linked treatment_menus row
      const { data: menuRow } = await supabase
        .from("treatment_menus")
        .select("category")
        .eq("bundle_id", bundleId)
        .maybeSingle();

      form.reset({
        name: bundle.name,
        name_en: bundle.name_en || "",
        description: bundle.description || "",
        description_en: bundle.description_en || "",
        hotel_id: bundle.hotel_id,
        total_sessions: bundle.total_sessions,
        price: Number(bundle.price),
        validity_days: bundle.validity_days || 365,
        status: bundle.status as "active" | "inactive",
        category: menuRow?.category || "",
        eligible_treatment_ids: items?.map((i) => i.treatment_id) || [],
      });
    } catch {
      toast.error("Erreur lors du chargement");
      navigate("/admin/cures");
    } finally {
      setLoading(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const bundlePayload = {
        name: values.name,
        name_en: values.name_en || null,
        description: values.description || null,
        description_en: values.description_en || null,
        hotel_id: values.hotel_id,
        total_sessions: values.total_sessions,
        price: values.price,
        validity_days: values.validity_days,
        status: values.status,
      };

      let bundleId: string;

      if (isNewMode) {
        const { data, error } = await supabase
          .from("treatment_bundles")
          .insert(bundlePayload)
          .select("id")
          .single();
        if (error) throw error;
        bundleId = data.id;
      } else {
        const { error } = await supabase
          .from("treatment_bundles")
          .update(bundlePayload)
          .eq("id", id!);
        if (error) throw error;
        bundleId = id!;
      }

      // Sync bundle items: delete all, re-insert
      await supabase
        .from("treatment_bundle_items")
        .delete()
        .eq("bundle_id", bundleId);

      if (values.eligible_treatment_ids.length > 0) {
        const { error: itemsError } = await supabase
          .from("treatment_bundle_items")
          .insert(
            values.eligible_treatment_ids.map((treatmentId) => ({
              bundle_id: bundleId,
              treatment_id: treatmentId,
            }))
          );
        if (itemsError) throw itemsError;
      }

      // Upsert corresponding treatment_menus entry with is_bundle = true
      const existingMenu = await supabase
        .from("treatment_menus")
        .select("id")
        .eq("bundle_id", bundleId)
        .maybeSingle();

      const menuPayload = {
        name: values.name,
        name_en: values.name_en || null,
        description: values.description || null,
        description_en: values.description_en || null,
        hotel_id: values.hotel_id,
        price: values.price,
        duration: 0,
        status: values.status,
        is_bundle: true,
        bundle_id: bundleId,
        category: values.category,
      };

      if (existingMenu.data) {
        await supabase
          .from("treatment_menus")
          .update(menuPayload)
          .eq("id", existingMenu.data.id);
      } else {
        await supabase
          .from("treatment_menus")
          .insert({ ...menuPayload, service_for: "Both" });
      }

      return bundleId;
    },
    onSuccess: (bundleId) => {
      queryClient.invalidateQueries({ queryKey: ["treatment-bundles"] });
      queryClient.invalidateQueries({ queryKey: ["treatment-menus"] });
      toast.success(isNewMode ? "Modele de cure cree" : "Modele de cure mis a jour");
      if (isNewMode) {
        navigate(`/admin/cures/templates/${bundleId}`, { replace: true });
      } else {
        setIsEditingState(false);
      }
    },
    onError: () => {
      toast.error("Erreur lors de l'enregistrement");
    },
  });

  const handleSave = async () => {
    const isValid = await form.trigger();
    if (!isValid) return;
    saveMutation.mutate(form.getValues());
  };

  const handleCancelEdit = () => {
    if (id) loadBundle(id);
    setIsEditingState(false);
  };

  // Group treatments by category for display
  const treatmentsByCategory = useMemo(() => {
    if (!treatments) return {};
    const grouped: Record<string, typeof treatments> = {};
    for (const t of treatments) {
      const cat = t.category || "Autre";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(t);
    }
    return grouped;
  }, [treatments]);

  const selectedTreatmentIds = form.watch("eligible_treatment_ids");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="bg-background">
      {/* Header */}
      <div className="border-b bg-background sticky top-0 z-10">
        <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/admin/cures")}
              className="flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Retour</span>
            </Button>
            <div className="h-5 w-px bg-border flex-shrink-0" />
            <h1 className="text-lg font-medium truncate">
              {isNewMode ? t("cures.createTemplate") : watchedName || "Modele de cure"}
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isNewMode ? (
              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Enregistrer
              </Button>
            ) : isEditing ? (
              <>
                <Button variant="outline" onClick={handleCancelEdit} disabled={saveMutation.isPending}>
                  Annuler
                </Button>
                <Button onClick={handleSave} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Enregistrer
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setIsEditingState(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Modifier
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="px-4 md:px-6 py-6 max-w-3xl">
        <Form {...form}>
          <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
            {/* Basic info */}
            <div className="bg-card rounded-lg border border-border p-4 md:p-6 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Informations</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("cures.templateName")} (FR) *</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={!isEditing} placeholder="ex: Cure 5 massages" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name_en"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("cures.templateName")} (EN)</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={!isEditing} placeholder="e.g. 5 Massage Package" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (FR)</FormLabel>
                      <FormControl>
                        <Textarea {...field} disabled={!isEditing} rows={3} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description_en"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (EN)</FormLabel>
                      <FormControl>
                        <Textarea {...field} disabled={!isEditing} rows={3} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="hotel_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lieu *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!isEditing}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selectionner un lieu" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {hotels?.map((hotel) => (
                          <SelectItem key={hotel.id} value={hotel.id}>
                            {hotel.name}
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
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Catégorie d'affichage *</FormLabel>
                    <FormControl>
                      <CategorySelectField
                        hotelId={watchedHotelId || null}
                        value={field.value}
                        onChange={field.onChange}
                        disabled={!isEditing || !watchedHotelId}
                        placeholder={watchedHotelId ? "Sélectionner une catégorie" : "Sélectionnez d'abord un lieu"}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="total_sessions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("cures.totalSessions")} *</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("cures.price")} *</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} step="0.01" {...field} disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="validity_days"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("cures.validityDays")}</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Statut</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!isEditing}
                    >
                      <FormControl>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Actif</SelectItem>
                        <SelectItem value="inactive">Inactif</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            {/* Eligible treatments */}
            <div className="bg-card rounded-lg border border-border p-4 md:p-6 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">
                {t("cures.eligibleTreatments")}
                {selectedTreatmentIds.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({selectedTreatmentIds.length} selectionne{selectedTreatmentIds.length > 1 ? "s" : ""})
                  </span>
                )}
              </h2>

              {!watchedHotelId ? (
                <p className="text-sm text-muted-foreground">Selectionnez d'abord un lieu</p>
              ) : !treatments || treatments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun soin disponible pour ce lieu</p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(treatmentsByCategory).map(([category, categoryTreatments]) => (
                    <div key={category}>
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        {category}
                      </h3>
                      <div className="space-y-1.5">
                        {categoryTreatments.map((treatment) => {
                          const isChecked = selectedTreatmentIds.includes(treatment.id);
                          return (
                            <label
                              key={treatment.id}
                              className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 cursor-pointer"
                            >
                              <Checkbox
                                checked={isChecked}
                                disabled={!isEditing}
                                onCheckedChange={(checked) => {
                                  const current = form.getValues("eligible_treatment_ids");
                                  if (checked) {
                                    form.setValue("eligible_treatment_ids", [...current, treatment.id]);
                                  } else {
                                    form.setValue(
                                      "eligible_treatment_ids",
                                      current.filter((tid) => tid !== treatment.id)
                                    );
                                  }
                                }}
                              />
                              <span className="text-sm text-foreground">{treatment.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
