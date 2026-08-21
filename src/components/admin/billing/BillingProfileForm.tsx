import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, FileText, Landmark, Loader2, Save } from "lucide-react";

const billingSchema = z.object({
  commercial_name: z.string().optional().default(""),
  company_name: z.string().optional().default(""),
  legal_form: z.string().optional().default(""),
  legal_capital: z.string().optional().default(""),
  siret: z.string().optional().default(""),
  siren: z.string().optional().default(""),
  tva_number: z.string().optional().default(""),
  vat_exempt: z.boolean().default(false),
  billing_address: z.string().optional().default(""),
  billing_postal_code: z.string().optional().default(""),
  billing_city: z.string().optional().default(""),
  billing_country: z.string().optional().default("France"),
  contact_email: z.string().email().optional().or(z.literal("")),
  contact_phone: z.string().optional().default(""),
  iban: z.string().optional().default(""),
  bic: z.string().optional().default(""),
  bank_name: z.string().optional().default(""),
});

export type BillingProfileFormValues = z.infer<typeof billingSchema>;

const defaultValues: BillingProfileFormValues = {
  commercial_name: "",
  company_name: "",
  legal_form: "",
  legal_capital: "",
  siret: "",
  siren: "",
  tva_number: "",
  vat_exempt: false,
  billing_address: "",
  billing_postal_code: "",
  billing_city: "",
  billing_country: "France",
  contact_email: "",
  contact_phone: "",
  iban: "",
  bic: "",
  bank_name: "",
};

interface BillingProfileFormProps {
  ownerType: "therapist" | "hotel" | "organization";
  ownerId: string;
  disabled?: boolean;
  /**
   * When provided, the parent page owns the save action: the ref receives a
   * function that persists the profile (silently on success) so the page's own
   * "Enregistrer" button saves this card too, and the local button is hidden.
   */
  submitRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

export function BillingProfileForm({
  ownerType,
  ownerId,
  disabled = false,
  submitRef,
}: BillingProfileFormProps) {
  const { t } = useTranslation(["admin", "common"]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasProfile, setHasProfile] = useState(true);

  const form = useForm<BillingProfileFormValues>({
    resolver: zodResolver(billingSchema),
    defaultValues,
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("billing_profiles")
        .select("*")
        .eq("owner_type", ownerType)
        .eq("owner_id", ownerId)
        .maybeSingle();

      if (cancelled) return;
      if (error && error.code !== "PGRST116") {
        console.error("Error loading billing profile:", error);
      }
      if (data) {
        form.reset({
          commercial_name: data.commercial_name ?? "",
          company_name: data.company_name ?? "",
          legal_form: data.legal_form ?? "",
          legal_capital: data.legal_capital ?? "",
          siret: data.siret ?? "",
          siren: data.siren ?? "",
          tva_number: data.tva_number ?? "",
          vat_exempt: data.vat_exempt ?? false,
          billing_address: data.billing_address ?? "",
          billing_postal_code: data.billing_postal_code ?? "",
          billing_city: data.billing_city ?? "",
          billing_country: data.billing_country ?? "France",
          contact_email: data.contact_email ?? "",
          contact_phone: data.contact_phone ?? "",
          iban: data.iban ?? "",
          bic: data.bic ?? "",
          bank_name: data.bank_name ?? "",
        });
      } else {
        form.reset(defaultValues);
      }
      setHasProfile(!!data);
      setLoading(false);
    };
    if (ownerId) load();
    return () => {
      cancelled = true;
    };
  }, [ownerType, ownerId, form]);

  const vatExempt = form.watch("vat_exempt");

  const persist = async (values: BillingProfileFormValues, silent = false) => {
    setSaving(true);
    try {
      const payload = {
        owner_type: ownerType,
        owner_id: ownerId,
        commercial_name: values.commercial_name || null,
        company_name: values.company_name || null,
        legal_form: values.legal_form || null,
        legal_capital: values.legal_capital || null,
        siret: values.siret || null,
        siren: values.siren || null,
        tva_number: values.vat_exempt ? null : values.tva_number || null,
        vat_exempt: values.vat_exempt,
        billing_address: values.billing_address || null,
        billing_postal_code: values.billing_postal_code || null,
        billing_city: values.billing_city || null,
        billing_country: values.billing_country || null,
        contact_email: values.contact_email || null,
        contact_phone: values.contact_phone || null,
        iban: values.iban || null,
        bic: values.bic || null,
        bank_name: values.bank_name || null,
      };

      const { error } = await supabase.from("billing_profiles").upsert(payload, {
        onConflict: "owner_type,owner_id",
      });

      if (error) throw error;
      setHasProfile(true);
      if (!silent) {
        toast.success(
          t("admin:therapists.billingInfo.saveSuccess", "Informations de facturation enregistrées"),
        );
      }
    } catch (err) {
      console.error("Error saving billing profile:", err);
      toast.error(
        t("admin:therapists.billingInfo.saveError", "Erreur lors de l'enregistrement"),
      );
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = (values: BillingProfileFormValues) => persist(values);

  useEffect(() => {
    if (!submitRef) return;
    submitRef.current = () => form.handleSubmit((values) => persist(values, true))();
    return () => {
      submitRef.current = null;
    };
  });

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-normal flex items-center gap-2">
              <FileText className="h-4 w-4 text-sky-600" />
              {t("admin:therapists.billingInfo.title", "Informations de facturation")}
            </CardTitle>
            <CardDescription>
              {t(
                "admin:therapists.billingInfo.description",
                "Utilisées pour générer les factures mensuelles automatiquement",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!hasProfile && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="font-normal">
                  {t(
                    "admin:therapists.billingInfo.missingTitle",
                    "Aucun profil de facturation défini",
                  )}
                </AlertTitle>
                <AlertDescription>
                  {ownerType === "organization"
                    ? t(
                        "admin:organization.billingProfile.missingDescription",
                        "Les factures émises ou reçues par cette organisation sortiront sans raison sociale, sans SIREN et sans numéro de TVA.",
                      )
                    : ownerType === "hotel"
                    ? t(
                        "admin:venue.billingProfile.missingDescription",
                        "Les factures des thérapeutes seront adressées à ce lieu avec les coordonnées de sa fiche, sans SIRET ni numéro de TVA.",
                      )
                    : t(
                        "admin:therapists.billingInfo.missingDescription",
                        "Les factures mensuelles seront générées sans adresse, sans SIRET, sans coordonnées bancaires et avec une TVA à 20 %, ce qui les rend non conformes.",
                      )}
                </AlertDescription>
              </Alert>
            )}

            {ownerType === "organization" && (
              <FormField
                control={form.control}
                name="commercial_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("admin:organization.billingProfile.commercialName", "Nom commercial")}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} disabled={disabled} />
                    </FormControl>
                    <FormDescription>
                      {t(
                        "admin:organization.billingProfile.commercialNameHint",
                        "Affiché en tête de facture. À défaut, la raison sociale est utilisée.",
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="company_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("admin:therapists.billingInfo.companyName", "Raison sociale")}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} disabled={disabled} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="legal_form"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("admin:therapists.billingInfo.legalForm", "Forme juridique")}
                    </FormLabel>
                    <Select
                      value={field.value || "none"}
                      onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                      disabled={disabled}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("admin:therapists.billingInfo.legalFormNone")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        <SelectItem value="Auto-entrepreneur">Auto-entrepreneur</SelectItem>
                        <SelectItem value="EI">{t("admin:therapists.billingInfo.legalFormEi")}</SelectItem>
                        <SelectItem value="EURL">EURL</SelectItem>
                        <SelectItem value="SARL">SARL</SelectItem>
                        <SelectItem value="SAS">SAS</SelectItem>
                        <SelectItem value="SASU">SASU</SelectItem>
                        <SelectItem value="Autre">{t("admin:therapists.billingInfo.legalFormOther")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {ownerType === "organization" && (
              <FormField
                control={form.control}
                name="legal_capital"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("admin:organization.billingProfile.legalCapital", "Capital social")}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} disabled={disabled} placeholder="10 000 €" />
                    </FormControl>
                    <FormDescription className="text-xs">
                      {t(
                        "admin:organization.billingProfile.legalCapitalHint",
                        "Repris dans les mentions légales en pied de facture.",
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="siret"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("admin:therapists.billingInfo.siret", "SIRET")}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} disabled={disabled} />
                    </FormControl>
                    <FormDescription className="text-xs">
                      {t(
                        "admin:therapists.billingInfo.siretHint",
                        "Laisser vide si auto-entrepreneur sans SIRET",
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="siren"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("admin:therapists.billingInfo.siren", "SIREN")}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} disabled={disabled} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Franchise en base (293 B) : cas des thérapeutes indépendants.
                Un lieu ou une organisation est une société assujettie. */}
            {ownerType === "therapist" && (
              <FormField
                control={form.control}
                name="vat_exempt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("admin:therapists.billingInfo.vatStatus", "Régime de TVA")}
                    </FormLabel>
                    <FormControl>
                      <SelectField
                        options={[
                          {
                            value: "subject",
                            label: t(
                              "admin:therapists.billingInfo.vatSubject",
                              "Assujetti à la TVA",
                            ),
                          },
                          {
                            value: "exempt",
                            label: t(
                              "admin:therapists.billingInfo.vatExempt",
                              "Non assujetti à la TVA",
                            ),
                          },
                        ]}
                        value={field.value ? "exempt" : "subject"}
                        onChange={(v) => field.onChange(v === "exempt")}
                        searchable={false}
                        disabled={disabled}
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      {t(
                        "admin:therapists.billingInfo.vatExemptHint",
                        "Article 293 B du CGI (auto-entrepreneurs)",
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="tva_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("admin:therapists.billingInfo.tvaNumber", "N° TVA intracommunautaire")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled={disabled || vatExempt}
                      placeholder={vatExempt ? "—" : "FR..."}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-normal">
              {t("admin:therapists.billingInfo.address", "Adresse")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="billing_address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("admin:therapists.billingInfo.addressLine", "Adresse postale")}
                  </FormLabel>
                  <FormControl>
                    <Input {...field} disabled={disabled} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="billing_postal_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("admin:therapists.billingInfo.postalCode", "Code postal")}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} disabled={disabled} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="billing_city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("admin:therapists.billingInfo.city", "Ville")}</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={disabled} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="billing_country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("admin:therapists.billingInfo.country", "Pays")}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} disabled={disabled} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="contact_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("admin:therapists.billingInfo.contactEmail", "Email de contact")}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} type="email" disabled={disabled} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("admin:therapists.billingInfo.contactPhone", "Téléphone de contact")}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} disabled={disabled} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-normal flex items-center gap-2">
              <Landmark className="h-4 w-4 text-emerald-600" />
              {t("admin:therapists.billingInfo.bankDetails", "Coordonnées bancaires")}
            </CardTitle>
            <CardDescription>
              {t(
                "admin:therapists.billingInfo.bankDetailsHint",
                "Utilisées sur les factures générées automatiquement",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="bank_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("admin:therapists.billingInfo.bankName", "Nom de la banque")}
                  </FormLabel>
                  <FormControl>
                    <Input {...field} disabled={disabled} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
              <FormField
                control={form.control}
                name="iban"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>IBAN</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={disabled} placeholder="FR76..." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bic"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>BIC</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={disabled} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {!disabled && !submitRef && (
          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {t("common:buttons.save")}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
