/** Standard CORS headers for browser-invoked edge functions. */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id",
} as const;

/** CORS headers for Stripe webhook endpoints (need stripe-signature). */
export const stripeWebhookCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id, stripe-signature",
} as const;
