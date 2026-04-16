import Stripe from "stripe";

/**
 * Stripe singleton client.
 * Equivalent to: supabase/functions/_shared/stripe-client.ts
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2025-08-27.basil",
});
