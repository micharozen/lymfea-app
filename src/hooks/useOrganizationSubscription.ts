import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import type { PlanCode, SubscriptionStatus, BillingCycle } from "@/lib/billing";

export interface PlanRow {
  id: string;
  code: PlanCode;
  name: string;
  description: string | null;
  monthly_amount_cents: number | null;
  yearly_amount_cents: number | null;
  currency: string;
  features: string[];
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface SubscriptionRow {
  id: string;
  organization_id: string;
  plan_id: string | null;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  status: SubscriptionStatus;
  billing_cycle: BillingCycle | null;
  seats: number;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  trial_end: string | null;
  default_payment_method: string | null;
  plan: PlanRow | null;
}

const STAFF_GRACE_STATUSES: SubscriptionStatus[] = [
  "trialing",
  "active",
  "past_due",
];

export interface OrganizationSubscription {
  subscription: SubscriptionRow | null;
  hasActiveBilling: boolean;
  isReadOnly: boolean;
  isTrialing: boolean;
  isPastDue: boolean;
  cancelAtPeriodEnd: boolean;
}

export function useOrganizationSubscription() {
  const { organizationId, activeOrganizationId, isSuperAdmin, loading: userLoading } =
    useUser();
  // Billing is always per-org (never "all orgs"). For super-admins, prefer the
  // explicitly picked active org, otherwise fall back to their home org.
  const orgId = isSuperAdmin
    ? activeOrganizationId ?? organizationId
    : organizationId;

  const query = useQuery<OrganizationSubscription>({
    enabled: Boolean(orgId) && !userLoading,
    queryKey: ["org-subscription", orgId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        // typing intentionally loose — types.ts not yet regenerated for plans/subscriptions
        .select(
          "id, organization_id, plan_id, stripe_customer_id, stripe_subscription_id, status, billing_cycle, seats, current_period_start, current_period_end, cancel_at_period_end, canceled_at, trial_end, default_payment_method, plan:plans(id, code, name, description, monthly_amount_cents, yearly_amount_cents, currency, features, stripe_price_id_monthly, stripe_price_id_yearly, is_active, sort_order)" as never,
        )
        .eq("organization_id", orgId!)
        .maybeSingle();

      if (error) throw error;

      const sub = (data as SubscriptionRow | null) ?? null;
      const status = sub?.status ?? null;
      const hasActiveBilling = status
        ? STAFF_GRACE_STATUSES.includes(status)
        : false;

      return {
        subscription: sub,
        hasActiveBilling,
        isReadOnly: status
          ? ["unpaid", "canceled", "incomplete_expired", "paused"].includes(status)
          : false,
        isTrialing: status === "trialing",
        isPastDue: status === "past_due",
        cancelAtPeriodEnd: Boolean(sub?.cancel_at_period_end),
      };
    },
  });

  return query;
}
