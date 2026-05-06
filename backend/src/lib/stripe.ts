import Stripe from "stripe";

const STRIPE_API_VERSION = "2025-08-27.basil" as const;

let cached: Stripe | null = null;

/**
 * Returns the global Stripe client built from STRIPE_SECRET_KEY.
 * Lazy: the SDK is only constructed on first call, and only if the
 * env var is set. Throws a clear error at call time (not at module
 * load) when the key is missing — so the backend can boot without a
 * global Stripe key when each venue brings its own (per-venue
 * resolution via lib/stripe-resolver.ts).
 */
export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured. Either set the env var for a global fallback, or ensure the request resolves a per-venue Stripe key via getStripeForVenue().",
    );
  }
  cached = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  return cached;
}

/**
 * Backward-compatible default export. This is a Proxy that builds the
 * client lazily on first property access — so `import { stripe } from "..."`
 * never crashes the module at boot when STRIPE_SECRET_KEY is missing.
 * The error only surfaces if you actually try to call a Stripe method.
 */
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(getStripe() as object, prop, receiver);
  },
});
