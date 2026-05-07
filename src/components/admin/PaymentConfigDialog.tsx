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
import { CreditCard, Loader2, CheckCircle2, XCircle, Plug, Copy } from "lucide-react";

const paymentConfigSchema = z
  .object({
    provider: z.enum(["none", "stripe", "adyen"]),
    // Stripe
    stripe_secret_key: z.string().optional(),
    stripe_publishable_key: z.string().optional(),
    stripe_webhook_secret: z.string().optional(),
    stripe_account_id: z.string().optional(),
    // Adyen
    adyen_api_key: z.string().optional(),
    adyen_merchant_account: z.string().optional(),
    adyen_environment: z.enum(["test", "live"]).optional(),
    adyen_client_key: z.string().optional(),
    adyen_hmac_key: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.provider === "adyen") {
      if (!data.adyen_merchant_account) {
        ctx.addIssue({
          path: ["adyen_merchant_account"],
          code: z.ZodIssueCode.custom,
          message: "Required",
        });
      }
      if (!data.adyen_environment) {
        ctx.addIssue({
          path: ["adyen_environment"],
          code: z.ZodIssueCode.custom,
          message: "Required",
        });
      }
    }
  });

type PaymentConfigFormValues = z.infer<typeof paymentConfigSchema>;

interface PaymentConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hotelId: string;
  hotelName: string;
  onSaved?: () => void;
}

export function PaymentConfigDialog({
  open,
  onOpenChange,
  onSaved,
  hotelId,
  hotelName,
}: PaymentConfigDialogProps) {
  const { t } = useTranslation("admin");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    connected: boolean;
    error?: string;
  } | null>(null);
  const [hasExistingStripeSecret, setHasExistingStripeSecret] = useState(false);
  const [hasExistingStripeWebhook, setHasExistingStripeWebhook] = useState(false);
  const [hasExistingAdyenKey, setHasExistingAdyenKey] = useState(false);
  const [hasExistingAdyenHmac, setHasExistingAdyenHmac] = useState(false);

  const form = useForm<PaymentConfigFormValues>({
    resolver: zodResolver(paymentConfigSchema),
    defaultValues: {
      provider: "none",
      stripe_secret_key: "",
      stripe_publishable_key: "",
      stripe_webhook_secret: "",
      stripe_account_id: "",
      adyen_api_key: "",
      adyen_merchant_account: "",
      adyen_environment: "test",
      adyen_client_key: "",
      adyen_hmac_key: "",
    },
  });

  const provider = form.watch("provider");

  useEffect(() => {
    if (!open || !hotelId) return;

    async function loadConfig() {
      setIsLoading(true);
      setTestResult(null);

      const { data, error } = await supabase
        .from("hotel_payment_configs" as any)
        .select("*")
        .eq("hotel_id", hotelId)
        .maybeSingle();

      if (data && !error) {
        const config = data as any;
        form.reset({
          provider: config.provider || "none",
          stripe_secret_key: "",
          stripe_publishable_key: config.stripe_publishable_key || "",
          stripe_webhook_secret: "",
          stripe_account_id: config.stripe_account_id || "",
          adyen_api_key: "",
          adyen_merchant_account: config.adyen_merchant_account || "",
          adyen_environment: (config.adyen_environment as "test" | "live") || "test",
          adyen_client_key: config.adyen_client_key || "",
          adyen_hmac_key: "",
        });
        // Sensitive fields are stored in Vault; we never load them back into
        // the form. We only know whether a secret was previously configured.
        const hasStripeVault = !!config.stripe_vault_secret_id;
        const hasAdyenVault = !!config.adyen_vault_secret_id;
        setHasExistingStripeSecret(hasStripeVault);
        setHasExistingStripeWebhook(hasStripeVault);
        setHasExistingAdyenKey(hasAdyenVault);
        setHasExistingAdyenHmac(hasAdyenVault);
      } else {
        form.reset({
          provider: "none",
          stripe_secret_key: "",
          stripe_publishable_key: "",
          stripe_webhook_secret: "",
          stripe_account_id: "",
          adyen_api_key: "",
          adyen_merchant_account: "",
          adyen_environment: "test",
          adyen_client_key: "",
          adyen_hmac_key: "",
        });
        setHasExistingStripeSecret(false);
        setHasExistingStripeWebhook(false);
        setHasExistingAdyenKey(false);
        setHasExistingAdyenHmac(false);
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
    >("payment-test-connection", {
      body: { hotelId },
    });

    if (error) {
      setTestResult({ connected: false, error: error.message });
    } else {
      setTestResult(data);
      if (data?.connected) {
        onSaved?.();
      }
    }

    setIsTesting(false);
  };

  const onSubmit = async (values: PaymentConfigFormValues) => {
    setIsSaving(true);

    try {
      const requestBody: {
        hotelId: string;
        provider: "none" | "stripe" | "adyen";
        publicFields: Record<string, string | null>;
        secrets: Record<string, string>;
      } = {
        hotelId,
        provider: values.provider,
        publicFields: {},
        secrets: {},
      };

      if (values.provider === "stripe") {
        requestBody.publicFields = {
          stripe_publishable_key: values.stripe_publishable_key || null,
          stripe_account_id: values.stripe_account_id || null,
        };
        if (values.stripe_secret_key) {
          requestBody.secrets.stripe_secret_key = values.stripe_secret_key;
        }
        if (values.stripe_webhook_secret) {
          requestBody.secrets.stripe_webhook_secret = values.stripe_webhook_secret;
        }
      }

      if (values.provider === "adyen") {
        requestBody.publicFields = {
          adyen_merchant_account: values.adyen_merchant_account || null,
          adyen_environment: values.adyen_environment || "test",
          adyen_client_key: values.adyen_client_key || null,
        };
        if (values.adyen_api_key) {
          requestBody.secrets.adyen_api_key = values.adyen_api_key;
        }
        if (values.adyen_hmac_key) {
          requestBody.secrets.adyen_hmac_key = values.adyen_hmac_key;
        }
      }

      const { error: invokeError } = await invokeEdgeFunction<
        typeof requestBody,
        { success: boolean; error?: string }
      >("payment-config-upsert", { body: requestBody });

      if (invokeError) {
        console.error("Failed to save payment config:", invokeError);
        toast.error(t("payment.saveFailed"));
        return;
      }

      if (values.provider === "none") {
        toast.success(t("payment.saved"));
        setHasExistingStripeSecret(false);
        setHasExistingStripeWebhook(false);
        setHasExistingAdyenKey(false);
        setHasExistingAdyenHmac(false);
        onSaved?.();
        return;
      }

      toast.success(t("payment.saved"));
      onSaved?.();

      if (values.provider === "stripe") {
        if (values.stripe_secret_key) {
          setHasExistingStripeSecret(true);
          form.setValue("stripe_secret_key", "");
        }
        if (values.stripe_webhook_secret) {
          setHasExistingStripeWebhook(true);
          form.setValue("stripe_webhook_secret", "");
        }
      }
      if (values.provider === "adyen") {
        if (values.adyen_api_key) {
          setHasExistingAdyenKey(true);
          form.setValue("adyen_api_key", "");
        }
        if (values.adyen_hmac_key) {
          setHasExistingAdyenHmac(true);
          form.setValue("adyen_hmac_key", "");
        }
      }
    } catch (err) {
      console.error("Error saving payment config:", err);
      toast.error(t("payment.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const stripeReady =
    !!form.watch("stripe_secret_key") || hasExistingStripeSecret;
  const adyenReady =
    (!!form.watch("adyen_api_key") || hasExistingAdyenKey) &&
    !!form.watch("adyen_merchant_account") &&
    !!form.watch("adyen_environment");
  const canTest =
    (provider === "stripe" && stripeReady) ||
    (provider === "adyen" && adyenReady);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[960px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-normal">
            <CreditCard className="h-5 w-5" />
            {t("payment.title")} — {hotelName}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("payment.provider")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">{t("payment.none")}</SelectItem>
                        <SelectItem value="stripe">{t("payment.stripe")}</SelectItem>
                        <SelectItem value="adyen">{t("payment.adyen")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">
                      {t("payment.providerDesc")}
                    </FormDescription>
                  </FormItem>
                )}
              />

              {provider === "stripe" && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium text-muted-foreground">
                      {t("payment.stripeCredentials")}
                    </h4>

                    <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="stripe_secret_key"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("payment.stripeSecretKey")}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="password"
                              placeholder={hasExistingStripeSecret ? "••••••••" : "sk_test_..."}
                            />
                          </FormControl>
                          {hasExistingStripeSecret && !field.value && (
                            <p className="text-xs text-muted-foreground">
                              {t("payment.secretUnchanged")}
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="stripe_publishable_key"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("payment.stripePublishableKey")}</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="pk_test_..." />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="stripe_webhook_secret"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("payment.stripeWebhookSecret")}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="password"
                              placeholder={hasExistingStripeWebhook ? "••••••••" : "whsec_..."}
                            />
                          </FormControl>
                          {hasExistingStripeWebhook && !field.value && (
                            <p className="text-xs text-muted-foreground">
                              {t("payment.secretUnchanged")}
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="stripe_account_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("payment.stripeAccountId")}</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="acct_..." />
                          </FormControl>
                          <FormDescription className="text-xs">
                            {t("payment.stripeAccountIdDesc")}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    </div>

                    <StripeWebhookUrlField hotelId={hotelId} />
                  </div>
                </>
              )}

              {provider === "adyen" && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium text-muted-foreground">
                      {t("payment.adyenCredentials")}
                    </h4>

                    <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="adyen_environment"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("payment.adyenEnvironment")}</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="test">
                                {t("payment.adyenTest")}
                              </SelectItem>
                              <SelectItem value="live">
                                {t("payment.adyenLive")}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="adyen_api_key"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("payment.adyenApiKey")}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="password"
                              placeholder={hasExistingAdyenKey ? "••••••••" : "AQE..."}
                            />
                          </FormControl>
                          {hasExistingAdyenKey && !field.value && (
                            <p className="text-xs text-muted-foreground">
                              {t("payment.secretUnchanged")}
                            </p>
                          )}
                          <FormDescription className="text-xs">
                            {t("payment.adyenApiKeyDesc")}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="adyen_merchant_account"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("payment.adyenMerchantAccount")}</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="LymfeaECOM" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="adyen_client_key"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("payment.adyenClientKey")}</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="test_XXX..." />
                          </FormControl>
                          <FormDescription className="text-xs">
                            {t("payment.adyenClientKeyDesc")}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="adyen_hmac_key"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("payment.adyenHmacKey")}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="password"
                              placeholder={hasExistingAdyenHmac ? "••••••••" : ""}
                            />
                          </FormControl>
                          {hasExistingAdyenHmac && !field.value && (
                            <p className="text-xs text-muted-foreground">
                              {t("payment.secretUnchanged")}
                            </p>
                          )}
                          <FormDescription className="text-xs">
                            {t("payment.adyenHmacKeyDesc")}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    </div>
                  </div>
                </>
              )}

              {provider !== "none" && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTestConnection}
                      disabled={isTesting || !canTest}
                      className="w-full"
                    >
                      {isTesting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Plug className="h-4 w-4 mr-2" />
                      )}
                      {t("payment.testConnection")}
                    </Button>

                    {!canTest && (
                      <p className="text-xs text-muted-foreground text-center">
                        {t("payment.saveBeforeTest")}
                      </p>
                    )}

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
                            ? t("payment.testSuccess")
                            : `${t("payment.testFailed")}: ${testResult.error}`}
                        </span>
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  {t("payment.close")}
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="bg-foreground text-background hover:bg-foreground/90"
                >
                  {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t("payment.save")}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StripeWebhookUrlField({ hotelId }: { hotelId: string }) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const webhookUrl = supabaseUrl
    ? `${supabaseUrl}/functions/v1/stripe-webhook?hotel_id=${hotelId}`
    : "";

  const handleCopy = async () => {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success("URL copiée");
    } catch {
      toast.error("Impossible de copier");
    }
  };

  return (
    <FormItem>
      <FormLabel>Webhook URL Stripe</FormLabel>
      <div className="flex gap-2">
        <Input value={webhookUrl} readOnly className="font-mono text-xs" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleCopy}
          disabled={!webhookUrl}
          aria-label="Copier l'URL"
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
      <FormDescription className="text-xs">
        Collez cette URL dans Stripe Dashboard → Developers → Webhooks → Add endpoint,
        puis reportez le <code className="rounded bg-muted px-1">whsec_…</code> généré
        dans le champ Webhook secret ci-dessus.
      </FormDescription>
    </FormItem>
  );
}
