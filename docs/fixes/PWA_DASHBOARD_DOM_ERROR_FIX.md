# Fix: PWA DOM Error (NotFoundError: removeChild)

**Date:** 2026-06-09  
**Branch:** `fix/pwa-dashboard-dom-error`  
**Supersedes:** PR #205 (`cursor/fix-pwa-dashboard-dom-error-35bd`)

## Problem

Therapists hit the global `AppErrorFallback` on `/pwa/dashboard`:

```
NotFoundError: Failed to execute 'removeChild' on 'Node'
```

Likely contributing factors:

1. Async `setState` / toasts after component unmount (navigation, realtime callbacks)
2. Supabase realtime listeners firing after leaving a page
3. External DOM mutation (Google Translate wrapping text nodes)
4. Conditional mount/unmount of tab indicators in Dashboard

## Solution

### Shared hook: `useIsMounted`

[`src/hooks/useIsMounted.ts`](../../src/hooks/useIsMounted.ts) returns a ref that is `true` while the component is mounted. Use it before any `setState` or `toast` after `await` or in realtime callbacks.

```typescript
const isMountedRef = useIsMounted();

const data = await fetchSomething();
if (!isMountedRef.current) return;
setState(data);
```

### Files modified

| File | Changes |
|------|---------|
| `src/hooks/useIsMounted.ts` | New shared hook |
| `src/pages/pwa/Dashboard.tsx` | Full mount guards; CSS tab indicators (no conditional DOM) |
| `src/components/PushNotificationPrompt.tsx` | Timeout cleanup + mount guards |
| `src/components/pwa/Layout.tsx` | Realtime unread count guards; `notranslate` on root |
| `src/pages/pwa/BookingDetail.tsx` | `fetchBookingDetail` + realtime + `fetchRoomGap` guards |
| `src/pages/pwa/Bookings.tsx` | `fetchBookings` guards |
| `src/pages/pwa/Notifications.tsx` | `fetchNotifications` + realtime guards |

### DOM hardening

- **PWA layout:** `className="notranslate"` on the root container to reduce Google Translate DOM interference.
- **Dashboard tabs:** Tab underline uses opacity CSS instead of conditional `{active && <div />}` mount/unmount.

## Prevention guidelines

Apply `useIsMounted` to any component with:

- Supabase realtime subscriptions
- Long async fetch chains (`await` + `setState`)
- Toasts from async/realtime callbacks
- `setTimeout` / `setInterval` that update state

## Manual test checklist

| Scenario | Steps | Expected |
|----------|-------|----------|
| Fast navigation | Dashboard → booking → back ×10 during load | No ErrorBoundary crash |
| Realtime | Admin updates booking while therapist on dashboard | List updates, no crash |
| Pull-to-refresh | Pull refresh then navigate away immediately | No crash |
| Slow network | DevTools Slow 3G, open dashboard then leave | No crash |
| Google Translate | Enable auto-translate on `/pwa/dashboard`, switch tabs | No `removeChild` error |
| Push prompt | Wait for notification prompt on dashboard, navigate away | No crash |

## References

- Slack: #saoma_prod — 2026-06-08 18:53 CET
- User: `userId=ad1ba09e-a0af-4137-81a2-7f40ce4d3a60`
- Browser: Chrome 148 on Windows
