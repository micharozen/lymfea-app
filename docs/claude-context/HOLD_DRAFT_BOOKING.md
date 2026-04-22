# Hold & Draft Booking — Flow Documentation

## Purpose

When a client selects a time slot, the system immediately reserves it in the database ("hold"). A 5-minute countdown banner is shown to prevent double-booking while the client completes checkout, without requiring authentication.

---

## Flow Steps

### 1. Slot selection → Draft creation (`SchedulePanel`)

When the user taps a time slot, `SchedulePanel` calls the `create-draft-booking` Edge Function, which:

1. Calls `reserve_trunk_atomically` RPC to atomically lock the treatment room slot.
2. Creates a `bookings` row with `status: 'awaiting_payment'` and placeholder data (`DRAFT`, `draft@lymfea.com`, `+33000000000`).
3. Returns the booking UUID.

On success, `FlowContext` stores:
- `draftBookingId` — the UUID of the placeholder booking
- `holdExpiresAt` — `Date.now() + 5 * 60 * 1000` (5 minutes from now)

### 2. Countdown banner (`HoldBanner`)

`HoldBanner` renders whenever `holdExpiresAt` is set. It counts down in real time.

- **< 60 seconds remaining**: turns red and pulses.
- **On expiry (0 s)**: calls `cancelHold()` and redirects to the schedule page with `state: { sessionExpired: true }`. The slot is released and may still be available — the client sees an amber banner inviting them to re-select it.

### 3. GuestInfo step

The draft booking and 5-minute timer remain active. The hold protects the slot while the client fills in personal information.

If the client navigates **back** from GuestInfo, the back button calls `cancelHold()`, which deletes the draft and clears the flow.

### 4. Payment page

The draft booking and slot lock remain active. The timer continues while the client reviews the total and selects a payment method.

The back button navigates back to GuestInfo **without** calling `cancelHold()` — the draft is preserved so the client can return and pay.

### 5. Entering Stripe

When the client taps "Pay by card", **before** redirecting to Stripe:

- `setHoldExpiresAt(null)` — stops the countdown banner (so Stripe processing time doesn't evict the user).
- The draft booking **stays in the database** (it is NOT deleted).
- The `draftBookingId` is passed to the `create-setup-intent` Edge Function in the request body, which stores it in the Stripe session metadata as `meta.draftBookingId`.

### 6. Stripe completion → Confirmation (`confirm-setup-intent`)

When Stripe calls the webhook, `confirm-setup-intent`:

1. Reads `meta.draftBookingId` from the session metadata.
2. Looks up the draft: `SELECT * FROM bookings WHERE id = draftBookingId AND status = 'awaiting_payment'`.
3. **Draft found**: updates the booking with real client data and promotes status to `'pending'`. No new slot reservation needed.
4. **Draft not found** (expired / deleted by cron): falls back to calling `reserve_trunk_atomically` to try a fresh reservation. This is a best-effort fallback — the slot may have been taken.

---

## State Machine

```
[Slot selected]
      │
      ▼
 draft created (awaiting_payment)
 holdExpiresAt set (5 min)
      │
      ├─── Timer expires ──────────────► cancelHold() → draft deleted → /schedule?sessionExpired
      │
      ├─── Back from GuestInfo ────────► cancelHold() → draft deleted → /schedule
      │
      ├─── Back from Payment ──────────► navigate(guest-info, replace) — draft preserved
      │
      └─── Pay by card ────────────────► setHoldExpiresAt(null) — timer hidden, draft preserved
                                              │
                                              ▼
                                       Stripe checkout
                                              │
                                        ┌─────┴──────┐
                                        │            │
                                     success      abandon
                                        │            │
                                        ▼            ▼
                               promote draft    cron deletes draft
                               → 'pending'      after TTL
```

---

## Key Files

| File | Role |
|---|---|
| `src/pages/client/context/FlowContext.tsx` | `draftBookingId`, `holdExpiresAt`, `cancelHold()`, `setHoldExpiresAt()` |
| `src/components/client/HoldBanner.tsx` | Countdown UI, calls `cancelHold()` on expiry |
| `src/components/client/SchedulePanel.tsx` | Calls `create-draft-booking`, sets `holdExpiresAt` to +5 min |
| `src/pages/client/GuestInfo.tsx` | Back button calls `cancelHold()` |
| `src/pages/client/Payment.tsx` | Back button preserves draft; card pay calls `setHoldExpiresAt(null)` |
| `src/components/client/CheckoutPanel.tsx` | Sends `draftBookingId` to `create-setup-intent` |
| `supabase/functions/create-draft-booking/` | Creates placeholder booking via `reserve_trunk_atomically` |
| `supabase/functions/confirm-setup-intent/` | Promotes draft → pending, or falls back to fresh reserve |
| `supabase/functions/check-expired-slots/` | Cron: deletes `awaiting_payment` bookings past their TTL |

---

## Important Invariants

- **Only one code path deletes the draft client-side**: `cancelHold()`. Never call `supabase.from('bookings').delete()` on the draft from a payment component directly.
- **`setHoldExpiresAt(null)` ≠ `cancelHold()`**: the former hides the banner and stops the timer; the draft remains in DB and is passed to Stripe. The latter deletes the draft from DB and clears all flow state.
- **The `.eq('status', 'awaiting_payment')` guard** on the delete call prevents accidentally deleting a booking that was already promoted by `confirm-setup-intent` (race condition safety).
- **Cron cleanup**: `check-expired-slots` cleans up stale `awaiting_payment` bookings server-side, handling Stripe abandonments without client-side intervention.
