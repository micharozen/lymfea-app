import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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

const makeFormSchema = (t: TFunction) =>
  z.object({
    first_name: z.string().min(1, t("common:errors.validation.firstNameRequired")),
    last_name: z.string().min(1, t("common:errors.validation.lastNameRequired")),
    email: z.string().email(t("common:errors.validation.emailInvalid")),
    phone: z.string().default(""),
    country_code: z.string().default("+33"),
    is_super_admin: z.boolean().default(false),
  });

type FormValues = z.infer<ReturnType<typeof makeFormSchema>>;

interface AddAdminDialogProps {
  open: boolean;
  organizationId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddAdminDialog({ open, organizationId, onClose, onSuccess }: AddAdminDialogProps) {
  const { t } = useTranslation(["admin", "common"]);
  const { isSuperAdmin } = useUser();
  const formSchema = useMemo(() => makeFormSchema(t), [t]);
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
          ? t("addAdminDialog.notAllowed")
          : t("addAdminDialog.createFailed"),
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
      toast.error(t("addAdminDialog.inviteEmailFailed"));
      console.error(inviteError);
    } else {
      toast.success(t("addAdminDialog.inviteSuccess"));
    }

    handleClose();
    onSuccess();
  };

  const submitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("addAdminDialog.title")}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("addAdminDialog.firstName")}</FormLabel>
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
                    <FormLabel>{t("addAdminDialog.lastName")}</FormLabel>
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
                    <FormLabel>{t("addAdminDialog.countryCode")}</FormLabel>
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
                    <FormLabel>{t("addAdminDialog.phone")}</FormLabel>
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
                      <FormLabel>{t("addAdminDialog.superAdmin")}</FormLabel>
                      <FormDescription className="text-xs">
                        {t("addAdminDialog.superAdminDesc")}
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
                {t("common:buttons.cancel")}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t("addAdminDialog.invite")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
