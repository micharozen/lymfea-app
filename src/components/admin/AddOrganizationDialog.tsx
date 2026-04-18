import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useFileUpload } from "@/hooks/useFileUpload";
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
import { Building2, Loader2, Upload } from "lucide-react";

const slugPattern = /^[a-z0-9-]+$/;

const formSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  slug: z
    .string()
    .min(2, "Slug trop court")
    .max(64, "Slug trop long")
    .regex(slugPattern, "Slug: minuscules, chiffres et tirets uniquement"),
  contact_email: z.string().email("Email invalide").optional().or(z.literal("")),
  logo_url: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface AddOrganizationDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function AddOrganizationDialog({ open, onClose, onSuccess }: AddOrganizationDialogProps) {
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
    defaultValues: { name: "", slug: "", contact_email: "", logo_url: "" },
  });

  const handleClose = () => {
    form.reset();
    setLogoUrl("");
    onClose();
  };

  const onSubmit = async (values: FormValues) => {
    const { data: existing } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", values.slug)
      .maybeSingle();

    if (existing) {
      form.setError("slug", { message: "Ce slug est déjà utilisé" });
      return;
    }

    const { error } = await supabase.from("organizations").insert({
      name: values.name,
      slug: values.slug,
      contact_email: values.contact_email || null,
      logo_url: logoUrl || null,
    });

    if (error) {
      toast.error("Création impossible");
      console.error(error);
      return;
    }

    toast.success("Organisation créée");
    handleClose();
    onSuccess();
  };

  const nameValue = form.watch("name");
  const slugValue = form.watch("slug");
  const submitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvelle organisation</DialogTitle>
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
                    <Input
                      {...field}
                      placeholder="Groupe Marriott"
                      onChange={(e) => {
                        field.onChange(e);
                        if (!slugValue || slugValue === slugify(nameValue)) {
                          form.setValue("slug", slugify(e.target.value));
                        }
                      }}
                    />
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
                    <Input {...field} placeholder="groupe-marriott" />
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
                    <Input {...field} type="email" placeholder="contact@marriott.com" />
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
                Créer
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
