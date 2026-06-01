import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";

export type PlanCode = "starter" | "pro" | "enterprise";
export type BillingCycle = "monthly" | "yearly";
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

const BILLING_FN = "stripe-billing";

export interface CheckoutSessionResponse {
  url: string | null;
  session_id: string;
}

export interface PendingVenue {
  name: string;
  address: string;
  venue_type: "hotel" | "spa";
  postal_code?: string;
  city?: string;
  country?: string;
}

export async function createCheckoutSession(payload: {
  plan_code: PlanCode;
  billing_cycle: BillingCycle;
  success_url: string;
  cancel_url: string;
  seats?: number;
  pending_venue?: PendingVenue;
}) {
  return invokeEdgeFunction<typeof payload & { action: string }, CheckoutSessionResponse>(
    BILLING_FN,
    {
      body: { action: "create-checkout-session", ...payload },
    },
  );
}

export interface BillingPortalResponse {
  url: string;
}

export async function createBillingPortalSession(payload: { return_url: string }) {
  return invokeEdgeFunction<typeof payload & { action: string }, BillingPortalResponse>(
    BILLING_FN,
    {
      body: { action: "create-billing-portal-session", ...payload },
    },
  );
}

export interface UpdateSeatsPreview {
  mode: "preview";
  current_seats: number;
  new_seats: number;
  proration: {
    amount_due_cents: number;
    currency: string;
    total_cents: number;
    subtotal_cents: number;
    lines: Array<{ amount_cents: number; description: string | null }>;
  };
}

export interface UpdateSeatsConfirm {
  mode: "confirm";
  current_seats: number;
  new_seats: number;
}

export async function updateSubscriptionQuantity(payload: {
  delta: number;
  mode: "preview" | "confirm";
}) {
  return invokeEdgeFunction<
    typeof payload & { action: string },
    UpdateSeatsPreview | UpdateSeatsConfirm
  >(BILLING_FN, {
    body: { action: "update-subscription-quantity", ...payload },
  });
}

export interface BillingInvoice {
  id: string;
  number: string | null;
  status: string | null;
  amount_paid_cents: number;
  amount_due_cents: number;
  currency: string;
  created: number;
  period_start: number;
  period_end: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
}

export interface BillingPaymentMethod {
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
}

export interface BillingSummaryResponse {
  invoices: BillingInvoice[];
  payment_method: BillingPaymentMethod | null;
}

export async function getBillingSummary() {
  return invokeEdgeFunction<{ action: string }, BillingSummaryResponse>(BILLING_FN, {
    body: { action: "get-billing-summary" },
  });
}

// --- Onboarding (single edge fn with actions, like stripe-billing) -----------

const ONBOARDING_FN = "onboarding";

export interface CompleteOrganizationSignupResponse {
  organization_id: string;
  organization_slug: string;
  already_existed?: boolean;
}

export async function completeOrganizationSignup(payload: {
  organization_name: string;
  first_name: string;
  last_name: string;
  phone: string;
}) {
  return invokeEdgeFunction<
    typeof payload & { action: string },
    CompleteOrganizationSignupResponse
  >(ONBOARDING_FN, {
    body: { action: "complete-organization-signup", ...payload },
  });
}

export interface CompleteOnboardingVenueResponse {
  venue_id: string;
}

export async function completeOnboardingVenue() {
  return invokeEdgeFunction<{ action: string }, CompleteOnboardingVenueResponse>(
    ONBOARDING_FN,
    { body: { action: "complete-onboarding-venue" } },
  );
}
