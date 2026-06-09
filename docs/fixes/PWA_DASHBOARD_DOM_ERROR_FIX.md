# Fix: PWA Dashboard DOM Error (NotFoundError: removeChild)

**Date:** 2026-06-09  
**Branch:** `cursor/fix-pwa-dashboard-dom-error-35bd`  
**Slack Thread:** #saoma_prod - 2026-06-08 18:53 CET

## Problem Description

Therapists encountered a blocking `ErrorBoundary` crash on `/pwa/dashboard` with the error:

```
NotFoundError: Failed to execute 'removeChild' on 'Node'
```

This error occurred when React tried to manipulate DOM nodes that were either:
1. Already removed by external code (Chrome extensions like Google Translate)
2. Being updated after the component unmounted
3. Modified during React's reconciliation process

## Root Causes Identified

### 1. **Missing Unmount Protection**
The Dashboard component (`src/pages/pwa/Dashboard.tsx`) performed state updates without checking if the component was still mounted, unlike the correct pattern used in `NotificationsBellButton.tsx`.

### 2. **Real-time Subscriptions Without Guards**
Three Supabase real-time subscription callbacks updated state without mount checks:
- `UPDATE` event on `bookings` table (line 169)
- `INSERT` event on `bookings` table (line 216)
- `INSERT` event on `booking_therapists` table (line 231)

### 3. **Async Operations Completing After Unmount**
Functions like `checkAuth`, `fetchAllBookings`, `handleAcceptBooking`, and `handleDeclineBooking` could complete after user navigation, triggering:
- State updates on unmounted component
- Toast notifications attempting to render in disconnected DOM tree
- React reconciliation errors

### 4. **Toast Notifications from Callbacks**
Toast calls from async callbacks (e.g., line 186: booking taken by another therapist) could fire after the component was unmounted.

## Solution Implemented

### 1. **Added `isMountedRef` Pattern**

```typescript
const isMountedRef = useRef(true);

useEffect(() => {
  isMountedRef.current = true;
  checkAuth();
  return () => {
    isMountedRef.current = false;
  };
}, []);
```

### 2. **Protected All State Updates**

**Before:**
```typescript
setAllBookings(sortedData);
setLoading(false);
```

**After:**
```typescript
if (isMountedRef.current) {
  setAllBookings(sortedData);
  setLoading(false);
}
```

### 3. **Guarded Real-time Callbacks**

**Before:**
```typescript
.on('postgres_changes', { event: 'UPDATE', ... }, (payload) => {
  setAllBookings(prev => { /* update */ });
})
```

**After:**
```typescript
.on('postgres_changes', { event: 'UPDATE', ... }, (payload) => {
  if (!isMountedRef.current) return;
  setAllBookings(prev => { /* update */ });
})
```

### 4. **Protected Toast Calls**

**Before:**
```typescript
if (!isSecondary) {
  toast.info(t('dashboard.bookingTakenByOther', { id: newData.booking_id }));
}
```

**After:**
```typescript
if (!isSecondary && isMountedRef.current) {
  toast.info(t('dashboard.bookingTakenByOther', { id: newData.booking_id }));
}
```

### 5. **Early Returns in Async Functions**

```typescript
const { data } = await supabase.from('bookings').select('*');
if (!isMountedRef.current) return; // Early exit before state update
setAllBookings(data);
```

## Files Modified

- `src/pages/pwa/Dashboard.tsx`

## Changes Summary

1. Added `useRef` import
2. Created `isMountedRef` ref and lifecycle management
3. Protected 15+ state update locations
4. Guarded 3 real-time subscription callbacks
5. Added early returns in 4 async functions
6. Protected 9 toast notification calls

## Testing Recommendations

1. **Navigation stress test**: Rapidly navigate away from dashboard during data loading
2. **Real-time updates**: Accept/decline bookings while navigating between tabs
3. **Pull-to-refresh**: Trigger refresh and immediately navigate away
4. **Network delays**: Test with throttled network (slow 3G) to extend async operation duration
5. **Chrome extensions**: Test with Google Translate enabled (known DOM manipulator)

## Prevention Guidelines

For future components with similar patterns:

1. ✅ **Always use `isMountedRef`** for components with:
   - Real-time subscriptions
   - Async data fetching
   - Toast notifications from callbacks

2. ✅ **Guard all state updates** after async operations:
   ```typescript
   const data = await fetchData();
   if (!isMountedRef.current) return;
   setState(data);
   ```

3. ✅ **Check mount status before toasts** in callbacks:
   ```typescript
   if (isMountedRef.current) {
     toast.success('Operation completed');
   }
   ```

4. ✅ **Return cleanup functions** from `useEffect`:
   ```typescript
   useEffect(() => {
     isMountedRef.current = true;
     return () => {
       isMountedRef.current = false;
     };
   }, []);
   ```

## Related Issues

This pattern should be applied to other PWA pages with real-time subscriptions:
- `src/pages/pwa/BookingDetail.tsx`
- `src/pages/pwa/Bookings.tsx`
- Any component using Supabase real-time channels

## References

- Slack thread: #saoma_prod (2026-06-08 18:53 CET)
- Error: `NotFoundError: Failed to execute 'removeChild' on 'Node'`
- User: `userId=ad1ba09e-a0af-4137-81a2-7f40ce4d3a60`
- Browser: Chrome 148 on Windows
- Build: `app-Dk0WLvoC.js`
