# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Lymfea is a SaaS platform for spa management — booking, scheduling, therapist coordination, and billing. Three distinct UIs share one codebase:

- **Admin Dashboard** (`/admin/*`) — venue management (hotels/spas), bookings calendar, agenda views, analytics, financial reports
- **Therapist PWA** (`/pwa/*`) — mobile app for therapists (appointments, wallet, Stripe Connect payouts)
- **Client Booking Flow** (`/client/:hotelId/*`) — public online booking (QR-code or link, no auth, isolated guest session)

Venue types: `hotel` (hotel spa), `spa` (independent day spa) — each with adapted terminology via `useVenueTerms` hook.

## Legacy Naming (OOM → Lymfea)

This codebase was forked from OOM (a hairdressing platform). Many database tables, columns, and code identifiers still use OOM naming. Here is the mapping to Lymfea concepts:

| DB / Code name | Lymfea concept | Notes |
|---|---|---|
| `hairdressers` table | **Therapists** (thérapeutes) | Table will be renamed in future migration |
| `hairdresser_id` (in bookings) | **therapist_id** | FK to therapists |
| `hairdresser_hotels` | **therapist_venues** | Junction table |
| `hairdresser_payouts` | **therapist_payouts** | Stripe Connect payouts |
| `hairdresser_ratings` | **therapist_ratings** | Post-treatment ratings |
| `hairdresser_commission` (in hotels) | **therapist_commission** | Commission % for therapists |
| `hotel_commission` (in hotels) | **venue_commission** | Commission % for the venue |
| `trunks` table | **Treatment rooms / Salles de soin** | Will be transformed into room/cabin management |
| `trunk_id` (in bookings) | **room_id** | Which treatment room is used |
| `skills[]` (on hairdressers) | **Specializations** | Massage, facial, body wrap, etc. |
| `app_role: 'hairdresser'` | **therapist** role | Supabase enum value |
| `HairdresserProtectedRoute` | **TherapistProtectedRoute** | Route guard for therapist PWA |
| `--oom-safe-bottom` CSS var | iOS safe area variable | Legacy naming, to be renamed |
| `venue_type: 'coworking'` | **Removed** | Not applicable to Lymfea |
| `venue_type: 'enterprise'` | **Removed** | Not applicable to Lymfea |

**Rule: When writing new code, use Lymfea naming (therapist, treatment room, etc.). When modifying existing code, keep consistency with surrounding code until the full rename migration happens.**

## Commands

```bash
bun dev              # Vite dev server on port 8080
bun run build        # Production build
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
- `HairdresserProtectedRoute` — checks therapist role (legacy name: hairdresser)
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

`src/hooks/useVenueTerms.ts` returns labels adapted per venue type. Non-hook version `getVenueTerms()` available for non-component contexts. Always use these instead of hardcoding venue-specific strings.

Current venue types:
- `hotel` — spa within a hotel (supports room billing, "Room Number" field)
- `spa` — independent day spa (no room billing, standalone booking)

## Key Conventions

- Path alias: `@/*` maps to `src/*`
- UI components: shadcn/ui in `src/components/ui/` — use `cn()` from `src/lib/utils.ts` for class merging
- Forms: React Hook Form + Zod validation
- Toasts: Sonner (not shadcn toast)
- Dialogs: pattern of `useDialogState` hook for open/close management
- Styling: Tailwind with custom gold palette, dark mode via class strategy, custom Kormelink serif font
- iOS safe areas: handled via `--oom-safe-bottom` CSS variable (legacy name) and `pb-safe` utility

## Roadmap — Key Features (Lymfea)

High-level epics from the product roadmap:

1. **Identity & Branding** — per-venue logo, colors, visual differentiation
2. **Venue Management** — CRUD venues, treatment rooms (salles), therapist scheduling, opening hours
3. **Agenda Management** — centralized calendar with views by venue/room/therapist, color codes, min booking delay
4. **Client Booking Flow** — online reservation → pending → confirmation < 10min, alternative slot proposals
5. **Therapist Assignment** — broadcast to available therapists (first to accept wins) + manual fallback
6. **Notifications & Confirmations** — therapist reminders (D-1, H-3), client confirmation + D-1 reminder
7. **Post-Treatment Feedback** — automatic email + rating form
8. **Add-on During Treatment** — therapist adds services from mobile, room availability check, auto-payment
9. **Product Sales** — retail product catalog per venue, add to invoice, hotel room charge notification
10. **Internal Emails** — configurable recipients per venue, auto-emails on every event
11. **Daily Reporting** — end-of-day recap with bookings + payment breakdown
12. **PMS Integration** — Opera Cloud + Mews for room charge and client data sync
13. **Automatic Invoicing** — monthly invoices to hotels and therapists
14. **Cancellation & No-show** — configurable cancellation policy, automatic penalties
15. **Gift Cards & Vouchers** — creation, codes, redemption at booking
16. **Client History** — persistent client profiles with treatment history and preferences
17. **Statistics & Dashboard** — occupancy rates, revenue by venue/therapist
18. **Multi-language** — FR/EN interface and emails
19. **Website Widget** — embeddable search widget for lymfea.com (search by treatment type, location, date)

## Prompt Context Tags

Préfixe ton prompt avec un de ces tags pour cibler un espace de l'app. Claude lira les fichiers clés associés avant d'intervenir.

### `@admin` — Admin Dashboard

| | |
|---|---|
| **Routes** | `/admin/*` — dashboard, bookings, therapists, places, treatments, treatment-rooms, concierges, products, orders, finance, transactions, analytics, settings, profile |
| **Auth** | `AdminProtectedRoute` — rôle `admin` ou `concierge` |
| **Layout** | `AppSidebar` + shadcn `SidebarProvider` (menu différent admin vs concierge) |
| **Pages** | `src/pages/admin/` — Dashboard, Bookings, Hotels, VenueDetail, Therapists, Treatments, TreatmentRooms, Concierges, Products, Orders, Finance, Transactions, Analytics, Settings, Profile |
| **Composants** | `src/components/admin/` (wizard, PMS config, details dialogs), `src/components/booking/` (calendar, list, create dialog, invoice), `src/components/table/` |
| **Hooks** | `src/hooks/booking/` — useBookingData, useBookingFilters, useBookingSelection, useBookingCart, useCalendarLogic, useCreateBookingMutation |
| **Contexts** | `UserContext` (userId, role, hotelIds, isAdmin, isConcierge), `TimezoneContext` |
| **i18n** | namespace `admin` — `src/i18n/locales/{en,fr}/admin.json` |

### `@pwa` — Therapist PWA (mobile)

| | |
|---|---|
| **Routes** | `/pwa/*` — public: splash, welcome, install, login. Protégé: onboarding, dashboard, bookings, booking/:id, notifications, hotels, wallet, new-booking, profile, account-security, stripe-callback |
| **Auth** | `TherapistProtectedRoute` (legacy `HairdresserProtectedRoute`) — rôle `therapist` |
| **Layout** | `PwaLayout` (`src/components/pwa/Layout.tsx`) + `TabBar` bottom nav (masqué sur booking/:id et new-booking) |
| **Pages** | `src/pages/pwa/` — Splash, Welcome, Install, Login, Onboarding, Dashboard, Bookings, BookingDetail, NewBooking, Notifications, Hotels, Wallet, Profile, AccountSecurity, StripeCallback, AddTreatmentDialog, ProposeAlternativeDialog |
| **Composants** | `src/components/pwa/` — Layout, TabBar, Header, PageLoader, PaymentSelectionDrawer, PwaCalendarView, `new-booking/` (ClientInfoStep, TreatmentStep, SummaryStep, SuccessStep) |
| **Hooks** | `useRoleRedirect` (routing par rôle), `useOneSignal` (push notifications) |
| **Contexts** | `UserContext` |
| **i18n** | namespace `pwa` — `src/i18n/locales/{en,fr}/pwa.json` |

### `@client` — Client Booking Flow (public)

| | |
|---|---|
| **Routes** | `/client/:hotelId/*` — welcome, treatments, schedule, guest-info, payment, checkout, confirmation/:bookingId. Aussi `/booking/manage/:bookingId`, `/booking/confirmation/:bookingId` |
| **Auth** | Aucune (public). `ClientFlowWrapper` crée une session guest isolée |
| **Layout** | `ClientFlowWrapper` → `AnalyticsProvider` → `ClientFlowProvider` → `PageTransition`. Classe CSS `.lymfea-client` |
| **Pages** | `src/pages/client/` — Welcome, Treatments, Cart, Schedule, GuestInfo, Payment, Checkout, Confirmation, ManageBooking |
| **Composants** | `src/components/client/` — CartDrawer, BestsellerSection, PractitionerCard, ProgressBar, TimePeriodSelector, OnRequestFormDrawer, ClientErrorFallback, `skeletons/` |
| **Contexts** | `CartContext` (sessionStorage, scoped par hotelId), `FlowContext` (state machine des étapes), `AnalyticsContext` — dans `src/pages/client/context/` |
| **Hooks** | `useClientSession`, `useClientPrefetch`, `useClientAnalytics`, `useVenueDefaultLanguage`, `useTreatmentCategories` |
| **i18n** | namespace `client` — `src/i18n/locales/{en,fr}/client.json` |

### `@place` — Place Page (détail venue, sous-ensemble admin)

| | |
|---|---|
| **Routes** | `/admin/places` (liste), `/admin/places/new` (créer), `/admin/places/:id` (éditer) |
| **Page principale** | `src/pages/admin/VenueDetail.tsx` — formulaire à onglets (React Hook Form + Zod) |
| **Onglets** | General (`VenueGeneralTab`), Deployment (`VenueDeploymentTab`), Treatment Rooms (`VenueTreatmentRoomsTab`), Therapists (`VenueTherapistsTab`), Categories (`VenueCategoriesStep`), Client Preview (`VenueClientPreviewTab`) |
| **Composants** | `src/components/admin/venue/` (tabs), `src/components/admin/steps/` (wizard steps), `VenueWizardDialog.tsx` (création rapide 3 étapes) |
| **Liste** | `src/pages/admin/Hotels.tsx` — table triable + HotelCard mobile |
| **Hooks** | `usePmsGuestLookup`, `useVenueTerms`, `useFileUpload` |

### `@edge` — Supabase Edge Functions

| | |
|---|---|
| **Dossier** | `supabase/functions/` (Deno/TypeScript) |
| **Shared** | `supabase/functions/_shared/` (brand, cors, supabase client, email templates) |
| **Appel frontend** | `invokeEdgeFunction()` dans `src/lib/supabaseEdgeFunctions.ts` |
| **Functions** | contact-admin, generate-invoice, handle-quote-response, invite-admin, notify-admin-new-booking, notify-admin-quote-pending, notify-booking-confirmed, notify-concierge-booking, notify-concierge-completion, notify-concierge-room-payment, send-booking-confirmation, send-quote-email |
| **Doc** | `docs/claude-context/SUPABASE_FUNCTIONS.md` |

**Exemples d'utilisation :**
- `@admin Ajouter un filtre par thérapeute sur la page Bookings`
- `@pwa Le bouton "accepter" ne marche pas sur BookingDetail`
- `@client Ajouter un champ "notes" à l'étape GuestInfo`
- `@place Ajouter un onglet "Produits" dans VenueDetail`
- `@edge Créer une function pour envoyer un rappel D-1`

## Context Documentation

Detailed docs live in `docs/claude-context/`:
- `DATABASE_SCHEMA.md` — all tables, RLS policies, RPC functions, data model adaptation plan
- `BUSINESS_LOGIC.md` — booking lifecycle, commission system, availability, therapist assignment
- `FRONTEND_ARCHITECTURE.md` — routes, contexts, component organization
- `SUPABASE_FUNCTIONS.md` — edge functions reference
- `PROJECT_OVERVIEW.md` — high-level overview

Read these before making changes to unfamiliar areas.
