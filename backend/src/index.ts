import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { errorHandler } from "./middleware/error-handler";

// Route modules
import health from "./routes/health";
import availability from "./routes/availability";
import payments from "./routes/payments";
import webhooks from "./routes/webhooks";

// Cron jobs
import { startExpiredSlotsJob } from "./jobs/expired-slots";

// ─── App Setup ──────────────────────────────────────────────────

const app = new Hono();

// ─── Global Middleware ───────────────────────────────────────────

// Request logging
app.use("*", logger());

// CORS — replaces the manual corsHeaders in every Edge Function
app.use(
  "*",
  cors({
    origin: process.env.FRONTEND_URL || "*",
    allowHeaders: [
      "Authorization",
      "Content-Type",
      "x-client-info",
      "apikey",
    ],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 86400,
  })
);

// Global error handler
app.onError(errorHandler);

// ─── Routes ─────────────────────────────────────────────────────

// Health check (public)
app.route("/health", health);

// Availability (public — no auth, same as Edge Function)
app.route("/availability", availability);

// Payments (authenticated)
app.route("/payments", payments);

// Webhooks (verified via Stripe signature, no JWT auth)
app.route("/webhooks", webhooks);

// ─── Migration Guide ────────────────────────────────────────────
//
// To add more Edge Functions, create a new file in src/routes/ and mount it:
//
//   import myRoute from "./routes/my-route";
//   app.route("/my-route", myRoute);
//
// Edge Function → Hono route mapping:
//
//   supabase/functions/check-availability   → /availability/check
//   supabase/functions/finalize-payment     → /payments/finalize
//   supabase/functions/stripe-webhook       → /webhooks/stripe
//   supabase/functions/send-booking-confirmation → import directly (no HTTP hop)
//   supabase/functions/create-checkout-session   → /payments/checkout (TODO)
//   supabase/functions/charge-saved-card         → /payments/charge-card (TODO)
//
// Key difference: Edge Functions that call other Edge Functions via
// `supabase.functions.invoke()` should instead import the handler directly.
// No more inter-function HTTP calls = faster + cheaper.

// ─── Start ──────────────────────────────────────────────────────

const port = parseInt(process.env.PORT || "3000", 10);

// Start cron jobs
startExpiredSlotsJob();

console.log(`🚀 Eïa Backend running on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
