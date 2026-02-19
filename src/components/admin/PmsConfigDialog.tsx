import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { Loader2, Plug, CheckCircle2, XCircle } from "lucide-react";

const pmsConfigSchema = z.object({
  pms_type: z.enum(["opera_cloud", "none"]),
  gateway_url: z.string().optional(),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
  app_key: z.string().optional(),
  enterprise_id: z.string().optional(),
  pms_hotel_id: z.string().optional(),
  auto_charge_room: z.boolean(),
  guest_lookup_enabled: z.boolean(),
});

type PmsConfigFormValues = z.infer<typeof pmsConfigSchema>;

interface PmsConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hotelId: string;
  hotelName: string;
}

export function PmsConfigDialog({
  open,
  onOpenChange,
  hotelId,
  hotelName,
}: PmsConfigDialogProps) {
  const { t } = useTranslation("admin");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    connected: boolean;
    error?: string;
  } | null>(null);
  const [hasExistingSecret, setHasExistingSecret] = useState(false);

  const form = useForm<PmsConfigFormValues>({
    resolver: zodResolver(pmsConfigSchema),
    defaultValues: {
      pms_type: "none",
      gateway_url: "",
      client_id: "",
      client_secret: "",
      app_key: "",
      enterprise_id: "",
      pms_hotel_id: "",
      auto_charge_room: false,
      guest_lookup_enabled: false,
    },
  });

  const pmsType = form.watch("pms_type");

  // Load existing config
  useEffect(() => {
    if (!open || !hotelId) return;

    async function loadConfig() {
      setIsLoading(true);
      setTestResult(null);

      const { data, error } = await supabase
        .from("hotel_pms_configs" as any)
        .select("*")
        .eq("hotel_id", hotelId)
        .maybeSingle();

      if (data && !error) {
        const config = data as any;
        form.reset({
          pms_type: config.pms_type || "opera_cloud",
          gateway_url: config.gateway_url || "",
          client_id: config.client_id || "",
          client_secret: "", // Never pre-fill secret
          app_key: config.app_key || "",
          enterprise_id: config.enterprise_id || "",
          pms_hotel_id: config.pms_hotel_id || "",
          auto_charge_room: config.auto_charge_room || false,
          guest_lookup_enabled: config.guest_lookup_enabled || false,
        });
        setHasExistingSecret(!!config.client_secret);
      } else {
        form.reset({
          pms_type: "none",
          gateway_url: "",
          client_id: "",
          client_secret: "",
          app_key: "",
          enterprise_id: "",
          pms_hotel_id: "",
          auto_charge_room: false,
          guest_lookup_enabled: false,
        });
        setHasExistingSecret(false);
      }

      setIsLoading(false);
    }

    loadConfig();
  }, [open, hotelId]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    const { data, error } = await invokeEdgeFunction<
      { hotelId: string },
      { connected: boolean; error?: string }
    >("opera-cloud-test-connection", {
      body: { hotelId },
    });

    if (error) {
      setTestResult({ connected: false, error: error.message });
    } else {
      setTestResult(data);
    }

    setIsTesting(false);
  };

  const onSubmit = async (values: PmsConfigFormValues) => {
    setIsSaving(true);

    try {
      if (values.pms_type === "none") {
        // Remove PMS config
        await supabase
          .from("hotel_pms_configs" as any)
          .delete()
          .eq("hotel_id", hotelId);

        // Reset flags on hotels table
        await supabase
          .from("hotels")
          .update({
            pms_type: null,
            pms_auto_charge_room: false,
            pms_guest_lookup_enabled: false,
          } as any)
          .eq("id", hotelId);

        toast.success(t("pms.saved"));
        onOpenChange(false);
        return;
      }

      // Build the config object
      const configData: Record<string, any> = {
        hotel_id: hotelId,
        pms_type: values.pms_type,
        gateway_url: values.gateway_url,
        client_id: values.client_id,
        app_key: values.app_key,
        enterprise_id: values.enterprise_id,
        pms_hotel_id: values.pms_hotel_id,
        auto_charge_room: values.auto_charge_room,
        guest_lookup_enabled: values.guest_lookup_enabled,
        updated_at: new Date().toISOString(),
      };

      // Only update client_secret if a new value was provided
      if (values.client_secret) {
        configData.client_secret = values.client_secret;
      }

      // Upsert PMS config
      const { error: upsertError } = await supabase
        .from("hotel_pms_configs" as any)
        .upsert(configData, { onConflict: "hotel_id" });

      if (upsertError) {
        console.error("Failed to save PMS config:", upsertError);
        toast.error(t("pms.saveFailed"));
        return;
      }

      // Sync flags on hotels table
      await supabase
        .from("hotels")
        .update({
          pms_type: values.pms_type,
          pms_auto_charge_room: values.auto_charge_room,
          pms_guest_lookup_enabled: values.guest_lookup_enabled,
        } as any)
        .eq("id", hotelId);

      toast.success(t("pms.saved"));
      onOpenChange(false);
    } catch (err) {
      console.error("Error saving PMS config:", err);
      toast.error(t("pms.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" />
            {t("pms.title")} — {hotelName}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* PMS Type */}
              <FormField
                control={form.control}
                name="pms_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("pms.type")}</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">{t("pms.none")}</SelectItem>
                        <SelectItem value="opera_cloud">
                          {t("pms.operaCloud")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              {/* Opera Cloud fields */}
              {pmsType === "opera_cloud" && (
                <>
                  <Separator />

                  <div className="space-y-4">
                    <h4 className="text-sm font-medium text-muted-foreground">
                      {t("pms.credentials")}
                    </h4>

                    <FormField
                      control={form.control}
                      name="gateway_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("pms.gatewayUrl")}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="https://your-gateway.opera-cloud.com"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="client_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("pms.clientId")}</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="client_secret"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("pms.clientSecret")}</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="password"
                                placeholder={
                                  hasExistingSecret
                                    ? "••••••••"
                                    : ""
                                }
                              />
                            </FormControl>
                            {hasExistingSecret && !field.value && (
                              <p className="text-xs text-muted-foreground">
                                {t("pms.secretUnchanged")}
                              </p>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="app_key"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("pms.appKey")}</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="enterprise_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("pms.enterpriseId")}</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="pms_hotel_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("pms.hotelId")}</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Test connection */}
                  <div className="space-y-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTestConnection}
                      disabled={isTesting}
                      className="w-full"
                    >
                      {isTesting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Plug className="h-4 w-4 mr-2" />
                      )}
                      {t("pms.testConnection")}
                    </Button>

                    {testResult && (
                      <div
                        className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                          testResult.connected
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : "bg-red-50 text-red-700 border border-red-200"
                        }`}
                      >
                        {testResult.connected ? (
                          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 flex-shrink-0" />
                        )}
                        <span>
                          {testResult.connected
                            ? t("pms.testSuccess")
                            : `${t("pms.testFailed")}: ${testResult.error}`}
                        </span>
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Feature toggles */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium text-muted-foreground">
                      {t("pms.features")}
                    </h4>

                    <FormField
                      control={form.control}
                      name="auto_charge_room"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm font-medium">
                              {t("pms.autoChargeRoom")}
                            </FormLabel>
                            <FormDescription className="text-xs">
                              {t("pms.autoChargeRoomDesc")}
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="guest_lookup_enabled"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm font-medium">
                              {t("pms.guestLookup")}
                            </FormLabel>
                            <FormDescription className="text-xs">
                              {t("pms.guestLookupDesc")}
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  {t("pms.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="bg-foreground text-background hover:bg-foreground/90"
                >
                  {isSaving && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {t("pms.save")}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
