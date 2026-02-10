# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

OOM is a SaaS platform for booking in-venue beauty/hairdressing services. Three distinct UIs share one codebase:

- **Admin Dashboard** (`/admin/*`) — hotel/venue management, bookings calendar, analytics, financial reports
- **Hairdresser PWA** (`/pwa/*`) — mobile app for hairdressers (appointments, wallet, Stripe Connect payouts)
- **Client Booking Flow** (`/client/:hotelId/*`) — public QR-code-based booking (no auth, isolated guest session)

Venue types: `hotel`, `coworking`, `enterprise` — each with adapted terminology via `useVenueTerms` hook.

## Commands

```bash
bun dev              # Vite dev server on port 8080
bun build            # Production build
bun lint             # ESLint
bun run supabase:function  # Serve Edge Functions locally
```

No test runner is configured.

## Architecture

**Stack**: React 18 + TypeScript + Vite, Tailwind CSS + shadcn/ui, Supabase (Postgres + Auth + Edge Functions), Stripe, i18next (FR/EN), PWA via vite-plugin-pwa + OneSignal.

### Routing & Code Splitting

Routes defined in `src/App.tsx`. All pages are lazy-loaded via `React.lazy()`. Vite splits vendor chunks manually (`vendor-react`, `vendor-query`, `vendor-form`, `vendor-date`, `pdf-export`, `charts`).

Protected route wrappers:
- `AdminProtectedRoute` — checks admin/concierge role
- `HairdresserProtectedRoute` — checks hairdresser role
- Client flow is public (no auth) — wrapped in `ClientFlowWrapper` which creates a temporary guest session isolated from staff auth

### State Management

- **Server state**: TanStack Query (30s staleTime, 5min gcTime, no refetch on window focus)
- **Auth/user**: `UserContext` (userId, role, hotelIds, isAdmin/isConcierge)
- **Timezone**: `TimezoneContext` with temporary override support
- **Cart**: `CartProvider` in client flow (sessionStorage-backed, hotelId-scoped)

### Supabase

- Client: `src/integrations/supabase/client.ts`
- Types: `src/integrations/supabase/types.ts` (auto-generated — do not edit manually, regenerate with `supabase gen types`)
- Edge Functions: `supabase/functions/` (Deno/TypeScript). Shared code in `supabase/functions/_shared/`
- Call edge functions from frontend via `invokeEdgeFunction()` in `src/lib/supabaseEdgeFunctions.ts`
- Key RPC functions: `get_public_hotel_by_id`, `get_public_treatments`, `is_venue_available_on_date`, `has_role`

### i18n

Namespaces: `common` (default), `admin`, `client`, `pwa`. Files in `src/i18n/locales/{en,fr}/`. Always provide both FR and EN translations when adding/changing keys.

### Venue-Aware Terminology

`src/hooks/useVenueTerms.ts` returns labels adapted per venue type (room vs workspace, payment options, service descriptions). Non-hook version `getVenueTerms()` available for non-component contexts. Always use these instead of hardcoding venue-specific strings.

## Key Conventions

- Path alias: `@/*` maps to `src/*`
- UI components: shadcn/ui in `src/components/ui/` — use `cn()` from `src/lib/utils.ts` for class merging
- Forms: React Hook Form + Zod validation
- Toasts: Sonner (not shadcn toast)
- Dialogs: pattern of `useDialogState` hook for open/close management
- Styling: Tailwind with custom gold palette, dark mode via class strategy, custom Kormelink serif font
- iOS safe areas: handled via `--oom-safe-bottom` CSS variable and `pb-safe` utility

## Context Documentation

Detailed docs live in `docs/claude-context/`:
- `DATABASE_SCHEMA.md` — all tables, RLS policies, RPC functions
- `BUSINESS_LOGIC.md` — booking lifecycle, commission system, availability
- `FRONTEND_ARCHITECTURE.md` — routes, contexts, component organization
- `SUPABASE_FUNCTIONS.md` — edge functions reference
- `PROJECT_OVERVIEW.md` — high-level overview

Read these before making changes to unfamiliar areas.
