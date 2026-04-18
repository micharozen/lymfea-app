import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { toast } from "sonner";
import { useUser } from "@/contexts/UserContext";
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
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";

const formSchema = z.object({
  first_name: z.string().min(1, "Prénom requis"),
  last_name: z.string().min(1, "Nom requis"),
  email: z.string().email("Email invalide"),
  phone: z.string().default(""),
  country_code: z.string().default("+33"),
  is_super_admin: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

interface AddAdminDialogProps {
  open: boolean;
  organizationId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddAdminDialog({ open, organizationId, onClose, onSuccess }: AddAdminDialogProps) {
  const { isSuperAdmin } = useUser();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      country_code: "+33",
      is_super_admin: false,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        country_code: "+33",
        is_super_admin: false,
      });
    }
  }, [open, form]);

  const handleClose = () => {
    form.reset();
    onClose();
  };

  const onSubmit = async (values: FormValues) => {
    const { error: insertError } = await supabase.from("admins").insert({
      first_name: values.first_name,
      last_name: values.last_name,
      email: values.email,
      phone: values.phone,
      country_code: values.country_code,
      status: "En attente",
      organization_id: organizationId,
      is_super_admin: isSuperAdmin ? values.is_super_admin : false,
    });

    if (insertError) {
      toast.error(
        insertError.message.includes("row-level security")
          ? "Action non autorisée"
          : "Création impossible",
      );
      console.error(insertError);
      return;
    }

    const { error: inviteError } = await invokeEdgeFunction("invite-admin", {
      body: {
        email: values.email,
        firstName: values.first_name,
        lastName: values.last_name,
      },
    });

    if (inviteError) {
      toast.error("Admin créé mais l'email d'invitation a échoué");
      console.error(inviteError);
    } else {
      toast.success("Administrateur invité");
    }

    handleClose();
    onSuccess();
  };

  const submitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter un administrateur</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prénom</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="last_name"
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
            </div>

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-[80px,1fr] gap-2">
              <FormField
                control={form.control}
                name="country_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Téléphone</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {isSuperAdmin && (
              <FormField
                control={form.control}
                name="is_super_admin"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Super-admin</FormLabel>
                      <FormDescription className="text-xs">
                        Staff Lymfea — accès global à toutes les organisations
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={handleClose}>
                Annuler
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Inviter
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
