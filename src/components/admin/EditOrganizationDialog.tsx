import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useInvalidateOrganizationsList } from "@/hooks/useOrganizationsList";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Building2, Loader2, Upload, Search } from "lucide-react";

const slugPattern = /^[a-z0-9-]+$/;
const sirenPattern = /^\d{9}$/;

const optionalText = z.string().optional().or(z.literal(""));

const formSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  slug: z
    .string()
    .min(2, "Slug trop court")
    .max(64, "Slug trop long")
    .regex(slugPattern, "Slug: minuscules, chiffres et tirets uniquement"),
  contact_email: z.string().email("Email invalide").optional().or(z.literal("")),
  // Legal identity (invoice issuer)
  commercial_name: optionalText,
  siren: z
    .string()
    .regex(sirenPattern, "SIREN: 9 chiffres")
    .optional()
    .or(z.literal("")),
  legal_name: optionalText,
  legal_form: optionalText,
  legal_capital: optionalText,
  siret: optionalText,
  rcs: optionalText,
  vat_number: optionalText,
  legal_address: optionalText,
  legal_postal_code: optionalText,
  legal_city: optionalText,
  legal_country: optionalText,
});

type FormValues = z.infer<typeof formSchema>;

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  contact_email: string | null;
  commercial_name?: string | null;
  siren?: string | null;
  legal_name?: string | null;
  legal_form?: string | null;
  legal_capital?: string | null;
  siret?: string | null;
  rcs?: string | null;
  vat_number?: string | null;
  legal_address?: string | null;
  legal_postal_code?: string | null;
  legal_city?: string | null;
  legal_country?: string | null;
  legal_synced_at?: string | null;
}

interface CompanyLookup {
  commercial_name: string | null;
  legal_name: string | null;
  legal_form: string | null;
  siret: string | null;
  rcs: string | null;
  vat_number: string;
  legal_address: string | null;
  legal_postal_code: string | null;
  legal_city: string | null;
  legal_country: string;
}

interface EditOrganizationDialogProps {
  open: boolean;
  organization: Organization | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditOrganizationDialog({
  open,
  organization,
  onClose,
  onSuccess,
}: EditOrganizationDialogProps) {
  const invalidateOrganizationsList = useInvalidateOrganizationsList();
  const [lookingUp, setLookingUp] = useState(false);
  // Set to the current time when a SIREN lookup succeeds, so we persist when the
  // legal identity was last synced against INSEE. null = never synced this edit.
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const {
    url: logoUrl,
    setUrl: setLogoUrl,
    uploading,
    fileInputRef,
    handleUpload,
    triggerFileSelect,
  } = useFileUpload({ bucket: "avatars", path: "organizations/" });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      slug: "",
      contact_email: "",
      commercial_name: "",
      siren: "",
      legal_name: "",
      legal_form: "",
      legal_capital: "",
      siret: "",
      rcs: "",
      vat_number: "",
      legal_address: "",
      legal_postal_code: "",
      legal_city: "",
      legal_country: "France",
    },
  });

  useEffect(() => {
    if (organization && open) {
      form.reset({
        name: organization.name,
        slug: organization.slug,
        contact_email: organization.contact_email ?? "",
        commercial_name: organization.commercial_name ?? "",
        siren: organization.siren ?? "",
        legal_name: organization.legal_name ?? "",
        legal_form: organization.legal_form ?? "",
        legal_capital: organization.legal_capital ?? "",
        siret: organization.siret ?? "",
        rcs: organization.rcs ?? "",
        vat_number: organization.vat_number ?? "",
        legal_address: organization.legal_address ?? "",
        legal_postal_code: organization.legal_postal_code ?? "",
        legal_city: organization.legal_city ?? "",
        legal_country: organization.legal_country ?? "France",
      });
      setLogoUrl(organization.logo_url ?? "");
      setSyncedAt(organization.legal_synced_at ?? null);
    }
  }, [organization, open, form, setLogoUrl]);

  const handleClose = () => {
    form.reset();
    setLogoUrl("");
    setSyncedAt(null);
    onClose();
  };

  // Fetch legal identity from the SIREN via the public gouv API.
  const handleLookup = async () => {
    const siren = (form.getValues("siren") ?? "").replace(/\s/g, "");
    if (!sirenPattern.test(siren)) {
      form.setError("siren", { message: "SIREN: 9 chiffres" });
      return;
    }
    setLookingUp(true);
    const { data, error } = await invokeEdgeFunction<
      { siren: string },
      { company: CompanyLookup }
    >("lookup-company", { body: { siren } });
    setLookingUp(false);

    if (error || !data?.company) {
      toast.error("Entreprise introuvable pour ce SIREN");
      return;
    }

    const c = data.company;
    // The commercial name stays user-entered; only fill it if still empty.
    if (!form.getValues("commercial_name") && c.commercial_name) {
      form.setValue("commercial_name", c.commercial_name);
    }
    form.setValue("legal_name", c.legal_name ?? "");
    form.setValue("legal_form", c.legal_form ?? "");
    form.setValue("siret", c.siret ?? "");
    form.setValue("rcs", c.rcs ?? "");
    form.setValue("vat_number", c.vat_number ?? "");
    form.setValue("legal_address", c.legal_address ?? "");
    form.setValue("legal_postal_code", c.legal_postal_code ?? "");
    form.setValue("legal_city", c.legal_city ?? "");
    form.setValue("legal_country", c.legal_country ?? "France");
    setSyncedAt(new Date().toISOString());
    toast.success("Infos légales récupérées — vérifiez avant d'enregistrer");
  };

  const onSubmit = async (values: FormValues) => {
    if (!organization) return;

    if (values.slug !== organization.slug) {
      const { data: existing } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", values.slug)
        .neq("id", organization.id)
        .maybeSingle();
      if (existing) {
        form.setError("slug", { message: "Ce slug est déjà utilisé" });
        return;
      }
    }

    const { error } = await supabase
      .from("organizations")
      .update({
        name: values.name,
        slug: values.slug,
        contact_email: values.contact_email || null,
        logo_url: logoUrl || null,
        commercial_name: values.commercial_name || null,
        siren: values.siren || null,
        legal_name: values.legal_name || null,
        legal_form: values.legal_form || null,
        legal_capital: values.legal_capital || null,
        siret: values.siret || null,
        rcs: values.rcs || null,
        vat_number: values.vat_number || null,
        legal_address: values.legal_address || null,
        legal_postal_code: values.legal_postal_code || null,
        legal_city: values.legal_city || null,
        legal_country: values.legal_country || null,
        legal_synced_at: syncedAt,
      })
      .eq("id", organization.id);

    if (error) {
      toast.error("Enregistrement impossible");
      console.error(error);
      return;
    }

    toast.success("Organisation mise à jour");
    await invalidateOrganizationsList();
    handleClose();
    onSuccess();
  };

  const submitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier l'organisation</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={triggerFileSelect}
                className="relative h-16 w-16 rounded-md bg-muted flex items-center justify-center overflow-hidden hover:opacity-80 transition-opacity"
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
                ) : (
                  <Building2 className="h-6 w-6 text-muted-foreground" />
                )}
              </button>
              <div className="flex-1">
                <Button type="button" variant="outline" size="sm" onClick={triggerFileSelect} disabled={uploading}>
                  <Upload className="h-3.5 w-3.5 mr-2" />
                  Logo
                </Button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
              </div>
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>Identifiant unique URL-friendly</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="contact_email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email de contact</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <div>
              <h3 className="text-sm font-medium text-foreground">Identité légale (facturation)</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Émetteur affiché sur les factures. Saisissez le SIREN et récupérez
                les informations officielles.
              </p>
            </div>

            <FormField
              control={form.control}
              name="commercial_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom commercial</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ex : Eïa" />
                  </FormControl>
                  <FormDescription>Nom affiché en tête de facture</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="siren"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SIREN</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input {...field} placeholder="900979592" inputMode="numeric" />
                    </FormControl>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleLookup}
                      disabled={lookingUp}
                    >
                      {lookingUp ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                      <span className="ml-2">Récupérer</span>
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="legal_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Raison sociale (INSEE)</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="legal_form"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Forme juridique</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="SAS" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="legal_capital"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capital social</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="1 258,57 €" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="siret"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SIRET (siège)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vat_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>N° TVA</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="rcs"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>RCS</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="legal_address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adresse</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="38 rue de Grenelle" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="legal_postal_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code postal</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="legal_city"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Ville</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="legal_country"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pays</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={handleClose}>
                Annuler
              </Button>
              <Button type="submit" disabled={submitting || uploading}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
