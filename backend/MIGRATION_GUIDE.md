# Migration Guide: Supabase Edge Functions → Hono Backend

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Frontend (Vite + React) — Railway Service          │
│                                                     │
│  invokeEdgeFunction() → Supabase Edge Functions     │
│  invokeApi()          → Hono Backend (NEW)          │
│  supabase.from()      → Supabase Postgres (direct)  │
│  supabase.auth.*      → Supabase Auth (unchanged)   │
└─────────┬──────────────────────┬────────────────────┘
          │                      │
          ▼                      ▼
┌─────────────────┐   ┌─────────────────────────────┐
│ Supabase Cloud  │   │  Hono Backend — Railway      │
│                 │   │                              │
│ • Postgres DB   │◄──│  • Same DB (direct connect)  │
│ • Auth          │   │  • Stripe integration        │
│ • Realtime      │   │  • Email (Resend)            │
│ • Storage       │   │  • Cron jobs                 │
│ • Edge Funcs*   │   │  • Business logic            │
│   (*gradually   │   │                              │
│    deprecated)  │   └─────────────────────────────┘
└─────────────────┘
```

## How to Migrate an Edge Function

### Step 1: Create the route

```typescript
// backend/src/routes/my-feature.ts
import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { supabaseAdmin } from "../lib/supabase";

const myFeature = new Hono();
myFeature.use("/*", authMiddleware); // if auth required

myFeature.post("/action", async (c) => {
  const body = await c.req.json();
  // Port the Edge Function logic here
  // Replace Deno.env.get(...) with process.env.XXX
  // Replace inline createClient() with supabaseAdmin
  return c.json({ success: true });
});

export default myFeature;
```

### Step 2: Mount in index.ts

```typescript
import myFeature from "./routes/my-feature";
app.route("/my-feature", myFeature);
```

### Step 3: Update the frontend call

```typescript
// Before (Edge Function):
const { data, error } = await invokeEdgeFunction('my-function', {
  body: { ... }
});

// After (Hono Backend):
import { invokeApi } from "@/lib/api";
const { data, error } = await invokeApi('my-feature/action', {
  body: { ... }
});
```

### Step 4: Test, then disable the Edge Function

Once the backend endpoint works, you can delete the Edge Function from
`supabase/functions/my-function/` and remove it from `supabase/config.toml`.

## Migration Priority

Migrate in this order (highest impact first):

### Phase 1 — Payment & Webhooks (critical path)
- [ ] `stripe-webhook` → `/webhooks/stripe`
- [ ] `stripe-connect-webhook` → `/webhooks/stripe-connect`
- [ ] `finalize-payment` → `/payments/finalize`
- [ ] `create-checkout-session` → `/payments/checkout`
- [ ] `charge-saved-card` → `/payments/charge-card`
- [ ] `send-payment-link` → `/payments/send-link`

### Phase 2 — Booking Logic
- [ ] `check-availability` → `/availability/check` (DONE — example)
- [ ] `validate-booking-slot` → `/availability/validate`
- [ ] `create-client-booking` → `/bookings/create`
- [ ] `handle-booking-cancellation` → `/bookings/cancel`
- [ ] `propose-alternative` → `/bookings/propose-alternative`

### Phase 3 — Notifications (consolidate)
- [ ] `send-booking-confirmation` → internal function (no HTTP endpoint)
- [ ] `notify-admin-new-booking` → internal function
- [ ] `notify-concierge-*` → internal functions
- [ ] `send-push-notification` → internal function
- [ ] `trigger-new-booking-notifications` → internal orchestrator

### Phase 4 — Admin & Auth
- [ ] `invite-admin`, `invite-concierge`, `invite-therapist` → `/admin/invite`
- [ ] `send-otp`, `verify-otp` → `/auth/otp`
- [ ] `generate-invoice`, `generate-monthly-invoices` → `/invoices/generate`

### Phase 5 — Cron Jobs
- [ ] `check-expired-slots` → `backend/src/jobs/expired-slots.ts` (DONE)
- [ ] `check-expired-payment-links` → `backend/src/jobs/expired-payment-links.ts`

### Phase 6 — PMS Integrations
- [ ] `opera-cloud-*`, `pms-*` → `/pms/...`

## Key Differences: Edge Functions vs Hono

| Edge Function (Deno) | Hono Backend (Bun) |
|---|---|
| `serve(async (req) => {})` | `app.post("/path", async (c) => {})` |
| `Deno.env.get("KEY")` | `process.env.KEY` |
| `new Response(JSON.stringify(data))` | `c.json(data)` |
| `req.json()` | `c.req.json()` |
| Manual CORS headers per function | Global `cors()` middleware |
| `supabase.functions.invoke(...)` | Direct import & function call |
| Cold start ~200-500ms | Always warm (0ms) |
| Billed per invocation | Fixed cost (Railway plan) |

## Railway Setup

1. In your Railway project, click **"New Service"**
2. Select **"GitHub Repo"** → point to this repo
3. Set **Root Directory** to `backend/`
4. Add environment variables (see `backend/.env.example`)
5. Railway auto-detects the Dockerfile and deploys
6. Add the backend URL as `VITE_API_URL` in your frontend service env vars

## What Stays on Supabase

- **Postgres database** — no change, backend connects directly
- **Auth** — no change, frontend still uses `supabase.auth.*`
- **Realtime** — no change (12 files using channels)
- **Storage** — no change (file uploads)
- **RLS policies** — still active for frontend direct queries
- **RPC functions** — still callable from frontend

The backend is an **addition**, not a replacement. Supabase remains your
database and auth provider. The backend just takes over the business logic
that was split across Edge Functions.
