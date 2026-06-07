import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreditCard, ExternalLink, Loader2, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { useOrganizationSubscription } from "@/hooks/useOrganizationSubscription";
import { useSeatCapacity } from "@/hooks/useSeatCapacity";
import {
  createBillingPortalSession,
  getBillingSummary,
  type SubscriptionStatus,
} from "@/lib/billing";
import { SeatUpgradeDialog } from "@/components/billing/SeatUpgradeDialog";

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function StatusBadge({ status }: { status: SubscriptionStatus }) {
  const tone: Record<SubscriptionStatus, string> = {
    trialing: "bg-blue-100 text-blue-800",
    active: "bg-green-100 text-green-800",
    past_due: "bg-yellow-100 text-yellow-900",
    canceled: "bg-zinc-200 text-zinc-700",
    incomplete: "bg-orange-100 text-orange-800",
    incomplete_expired: "bg-zinc-200 text-zinc-700",
    unpaid: "bg-red-100 text-red-800",
    paused: "bg-zinc-200 text-zinc-700",
  };
  return <Badge className={tone[status] ?? ""}>{status}</Badge>;
}

export default function Billing() {
  const { t, i18n } = useTranslation("admin");
  const queryClient = useQueryClient();
  const { data: subData, isLoading: subLoading } = useOrganizationSubscription();
  const capacity = useSeatCapacity();
  const [portalLoading, setPortalLoading] = useState(false);
  const [seatDialogOpen, setSeatDialogOpen] = useState(false);

  const summary = useQuery({
    enabled: Boolean(subData?.subscription?.stripe_customer_id),
    queryKey: ["billing-summary", subData?.subscription?.id],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await getBillingSummary();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    // Refresh subscription if window regains focus (e.g. after returning from portal).
    function refresh() {
      void queryClient.invalidateQueries({ queryKey: ["org-subscription"] });
      void queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
    }
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [queryClient]);

  async function openPortal() {
    setPortalLoading(true);
    const { data, error } = await createBillingPortalSession({
      return_url: window.location.href,
    });
    setPortalLoading(false);
    if (error || !data?.url) {
      toast.error(error?.message ?? "Could not open billing portal");
      return;
    }
    window.location.href = data.url;
  }

  if (subLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const sub = subData?.subscription;
  const locale = i18n.language?.startsWith("fr") ? fr : undefined;

  if (!sub) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("billing.empty.title", "No subscription")}</CardTitle>
            <CardDescription>
              {t(
                "billing.empty.description",
                "Your organization does not have a subscription yet. Choose a plan to get started.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href="/#pricing">{t("billing.empty.cta", "View plans")}</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const plan = sub.plan;
  const cycleAmount =
    sub.billing_cycle === "yearly"
      ? plan?.yearly_amount_cents
      : plan?.monthly_amount_cents;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {t("billing.title", "Billing & subscription")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t(
            "billing.subtitle",
            "Manage your plan, seats, payment method and invoices.",
          )}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{plan?.name ?? "—"}</CardTitle>
              <StatusBadge status={sub.status} />
            </div>
            <CardDescription>
              {sub.billing_cycle === "yearly"
                ? t("billing.cycle.yearly", "Yearly billing")
                : t("billing.cycle.monthly", "Monthly billing")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {cycleAmount != null && (
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-serif">
                  {formatMoney(cycleAmount * (sub.seats ?? 1), plan?.currency ?? "eur")}
                </span>
                <span className="text-sm text-muted-foreground">
                  /{sub.billing_cycle === "yearly" ? "an" : "mois"} · {sub.seats}{" "}
                  {t("billing.seats", "seat(s)")}
                </span>
              </div>
            )}

            {sub.trial_end && sub.status === "trialing" && (
              <p className="text-sm text-blue-800">
                {t("billing.trialEnds", {
                  date: format(parseISO(sub.trial_end), "PPP", { locale }),
                  defaultValue: `Trial ends on ${format(parseISO(sub.trial_end), "PPP", { locale })}`,
                })}
              </p>
            )}

            {sub.current_period_end && (
              <p className="text-sm text-muted-foreground">
                {sub.cancel_at_period_end
                  ? t("billing.endsOn", {
                      date: format(parseISO(sub.current_period_end), "PPP", { locale }),
                      defaultValue: `Ends on ${format(parseISO(sub.current_period_end), "PPP", { locale })}`,
                    })
                  : t("billing.renewsOn", {
                      date: format(parseISO(sub.current_period_end), "PPP", { locale }),
                      defaultValue: `Renews on ${format(parseISO(sub.current_period_end), "PPP", { locale })}`,
                    })}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={openPortal} disabled={portalLoading}>
                {portalLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("billing.actions.manage", "Manage subscription")}
              </Button>
              {!sub.cancel_at_period_end && (
                <Button variant="outline" onClick={() => setSeatDialogOpen(true)}>
                  {t("billing.actions.addSeat", "Add a seat")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {t("billing.usage.title", "Seats & venues")}
            </CardTitle>
            <CardDescription>
              {t("billing.usage.description", "1 venue = 1 seat.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold">{capacity.used}</span>
              <span className="text-muted-foreground">/ {capacity.seats}</span>
              <span className="ml-2 text-sm text-muted-foreground">
                {t("billing.usage.seatsUsed", "seats used")}
              </span>
            </div>

            <Card className="border-dashed">
              <CardContent className="flex items-center gap-3 p-3 text-sm">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                {summary.data?.payment_method ? (
                  <span>
                    {summary.data.payment_method.brand.toUpperCase()} ····{" "}
                    {summary.data.payment_method.last4} ·{" "}
                    {String(summary.data.payment_method.exp_month).padStart(2, "0")}/
                    {summary.data.payment_method.exp_year}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {t(
                      "billing.paymentMethod.none",
                      "No payment method on file",
                    )}
                  </span>
                )}
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ReceiptText className="h-4 w-4" />
            {t("billing.invoices.title", "Invoices")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summary.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !summary.data?.invoices?.length ? (
            <p className="text-sm text-muted-foreground">
              {t("billing.invoices.empty", "No invoices yet.")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("billing.invoices.col.date", "Date")}</TableHead>
                  <TableHead>{t("billing.invoices.col.number", "Number")}</TableHead>
                  <TableHead>{t("billing.invoices.col.status", "Status")}</TableHead>
                  <TableHead className="text-right">
                    {t("billing.invoices.col.amount", "Amount")}
                  </TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.data.invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      {format(new Date(inv.created * 1000), "PPP", { locale })}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {inv.number ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{inv.status ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(
                        inv.amount_paid_cents || inv.amount_due_cents,
                        inv.currency,
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {inv.hosted_invoice_url && (
                        <a
                          href={inv.hosted_invoice_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {t("billing.invoices.view", "View")}
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SeatUpgradeDialog
        open={seatDialogOpen}
        onOpenChange={setSeatDialogOpen}
        onConfirmed={() => {
          /* nothing extra — caller can refresh listings */
        }}
      />
    </div>
  );
}
