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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Landmark, Loader2, Save } from "lucide-react";

const billingSchema = z.object({
  company_name: z.string().optional().default(""),
  legal_form: z.string().optional().default(""),
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
  company_name: "",
  legal_form: "",
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
  ownerType: "therapist" | "hotel";
  ownerId: string;
  disabled?: boolean;
}

export function BillingProfileForm({
  ownerType,
  ownerId,
  disabled = false,
}: BillingProfileFormProps) {
  const { t } = useTranslation("common");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
          company_name: data.company_name ?? "",
          legal_form: data.legal_form ?? "",
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
      setLoading(false);
    };
    if (ownerId) load();
    return () => {
      cancelled = true;
    };
  }, [ownerType, ownerId, form]);

  const vatExempt = form.watch("vat_exempt");

  const onSubmit = async (values: BillingProfileFormValues) => {
    setSaving(true);
    try {
      const payload = {
        owner_type: ownerType,
        owner_id: ownerId,
        company_name: values.company_name || null,
        legal_form: values.legal_form || null,
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
      toast.success(
        t("admin:therapists.billingInfo.saveSuccess", "Informations de facturation enregistrées"),
      );
    } catch (err) {
      console.error("Error saving billing profile:", err);
      toast.error(
        t("admin:therapists.billingInfo.saveError", "Erreur lors de l'enregistrement"),
      );
    } finally {
      setSaving(false);
    }
  };

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
            <CardTitle className="text-base font-semibold flex items-center gap-2">
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
                          <SelectValue placeholder={t("common:none", "Aucune")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        <SelectItem value="Auto-entrepreneur">Auto-entrepreneur</SelectItem>
                        <SelectItem value="EI">Entreprise Individuelle (EI)</SelectItem>
                        <SelectItem value="EURL">EURL</SelectItem>
                        <SelectItem value="SARL">SARL</SelectItem>
                        <SelectItem value="SAS">SAS</SelectItem>
                        <SelectItem value="SASU">SASU</SelectItem>
                        <SelectItem value="Autre">Autre</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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

            <FormField
              control={form.control}
              name="vat_exempt"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>
                      {t("admin:therapists.billingInfo.vatExempt", "Non assujetti à la TVA")}
                    </FormLabel>
                    <FormDescription className="text-xs">
                      {t(
                        "admin:therapists.billingInfo.vatExemptHint",
                        "Article 293 B du CGI (auto-entrepreneurs)",
                      )}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={disabled}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

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
            <CardTitle className="text-base font-semibold">
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
            <CardTitle className="text-base font-semibold flex items-center gap-2">
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

        {!disabled && (
          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {t("common:save", "Enregistrer")}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
