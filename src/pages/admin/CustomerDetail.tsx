import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Loader2, Save, Pencil } from "lucide-react";
import { CustomerGeneralTab } from "@/components/admin/customer/CustomerGeneralTab";
import { CustomerNotesTab } from "@/components/admin/customer/CustomerNotesTab";
import { CustomerBookingsTab } from "@/components/admin/customer/CustomerBookingsTab";

const createFormSchema = (t: TFunction) =>
  z.object({
    first_name: z.string().min(1, t("admin:customers.firstNameRequired", "Le prénom est requis")),
    last_name: z.string().default(""),
    phone: z.string().min(1, t("admin:customers.phoneRequired", "Le téléphone est requis")),
    email: z.string().email(t("admin:customers.emailInvalid", "Email invalide")).or(z.literal("")),
    language: z.enum(["fr", "en"]).default("fr"),
  });

export type CustomerFormValues = z.infer<ReturnType<typeof createFormSchema>>;

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const formSchema = useMemo(() => createFormSchema(t), [t]);

  const isNewMode = !id;
  const [savedCustomerId, setSavedCustomerId] = useState<string | null>(id || null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [customerName, setCustomerName] = useState("");
  const [isEditingState, setIsEditingState] = useState(false);
  const isEditing = isNewMode || isEditingState;

  // Separate state for relational data (not in form schema)
  const [preferredTherapistId, setPreferredTherapistId] = useState<string | null>(null);
  const [preferredTreatmentType, setPreferredTreatmentType] = useState("");
  const [healthNotes, setHealthNotes] = useState("");

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      phone: "",
      email: "",
      language: "fr",
    },
  });

  useEffect(() => {
    if (id) {
      loadCustomerData(id);
    }
  }, [id]);

  const loadCustomerData = async (customerId: string) => {
    setLoading(true);
    try {
      const { data: customer, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .single();

      if (error) throw error;

      if (customer) {
        form.reset({
          first_name: customer.first_name || "",
          last_name: customer.last_name || "",
          phone: customer.phone || "",
          email: customer.email || "",
          language: (customer.language as "fr" | "en") || "fr",
        });

        setCustomerName(`${customer.first_name} ${customer.last_name || ""}`.trim());
        setPreferredTherapistId(customer.preferred_therapist_id || null);
        setPreferredTreatmentType(customer.preferred_treatment_type || "");
        setHealthNotes(customer.health_notes || "");
      }
    } catch (error) {
      console.error("Error loading customer data:", error);
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

      const customerPayload = {
        first_name: values.first_name,
        last_name: values.last_name || null,
        phone: values.phone,
        email: values.email || null,
        language: values.language,
        preferred_therapist_id: preferredTherapistId || null,
        preferred_treatment_type: preferredTreatmentType || null,
        health_notes: healthNotes || null,
      };

      if (isNewMode && !savedCustomerId) {
        const { data: inserted, error } = await supabase
          .from("customers")
          .insert(customerPayload)
          .select("id")
          .single();

        if (error) throw error;

        const newId = inserted.id;
        setSavedCustomerId(newId);
        setCustomerName(`${values.first_name} ${values.last_name || ""}`.trim());

        toast.success(t("admin:customers.createSuccess", "Client créé avec succès"));
        navigate(`/admin/customers/${newId}`, { replace: true });
      } else {
        const targetId = savedCustomerId || id!;

        const { error } = await supabase
          .from("customers")
          .update(customerPayload)
          .eq("id", targetId);

        if (error) throw error;

        setCustomerName(`${values.first_name} ${values.last_name || ""}`.trim());
        toast.success(t("admin:customers.saveSuccess", "Client enregistré avec succès"));
        setIsEditingState(false);
      }
    } catch (error: any) {
      console.error("Error saving customer:", error);
      if (error.code === "23505") {
        toast.error(t("admin:customers.duplicatePhone", "Un client avec ce numéro de téléphone existe déjà"));
      } else {
        toast.error("Erreur lors de l'enregistrement");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = async () => {
    if (id) {
      await loadCustomerData(id);
    }
    setIsEditingState(false);
  };

  const effectiveCustomerId = savedCustomerId || id || null;
  const canAccessTabs = !!effectiveCustomerId;

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
              onClick={() => navigate("/admin/customers")}
              className="flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">
                {t("admin:customers.back", "Retour")}
              </span>
            </Button>
            <div className="h-5 w-px bg-border flex-shrink-0" />
            <h1 className="text-lg font-semibold truncate">
              {isNewMode && !savedCustomerId
                ? t("admin:customers.new", "Nouveau client")
                : watchedName || customerName || "Client"}
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isNewMode ? (
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-foreground text-background hover:bg-foreground/90"
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
                  className="bg-foreground text-background hover:bg-foreground/90"
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
              <Button
                variant="outline"
                onClick={() => setIsEditingState(true)}
              >
                <Pencil className="mr-2 h-4 w-4" />
                {t("common:edit", "Modifier")}
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
                {t("admin:customers.tabs.general", "Général")}
              </TabsTrigger>
              <TabsTrigger
                value="notes"
                disabled={!canAccessTabs}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5"
              >
                {t("admin:customers.tabs.notes", "Notes & Préférences")}
              </TabsTrigger>
              <TabsTrigger
                value="bookings"
                disabled={!canAccessTabs}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5"
              >
                {t("admin:customers.tabs.bookings", "Historique")}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="px-4 md:px-6 py-4">
            <Form {...form}>
              <form onSubmit={(e) => e.preventDefault()}>
                <TabsContent value="general" className="mt-0">
                  <CustomerGeneralTab
                    form={form}
                    disabled={!isEditing}
                  />
                </TabsContent>
              </form>
            </Form>

            {canAccessTabs && (
              <>
                <TabsContent value="notes" className="mt-0">
                  <CustomerNotesTab
                    disabled={!isEditing}
                    preferredTherapistId={preferredTherapistId}
                    onPreferredTherapistChange={setPreferredTherapistId}
                    preferredTreatmentType={preferredTreatmentType}
                    onPreferredTreatmentTypeChange={setPreferredTreatmentType}
                    healthNotes={healthNotes}
                    onHealthNotesChange={setHealthNotes}
                  />
                </TabsContent>

                <TabsContent value="bookings" className="mt-0">
                  <CustomerBookingsTab customerId={effectiveCustomerId!} />
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      )}
    </div>
  );
}
