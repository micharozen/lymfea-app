# TanStack Query (React Query) Rules

## Configuration

- Separate server state (React Query) from client state (Context/localStorage)
- Use appropriate cache settings:
  - `staleTime`: How long data stays fresh (default: 30s in this project)
  - `gcTime`: How long unused data stays in cache (default: 5min)
- Prefer `invalidateQueries` over `refetchQueries` after mutations

## Patterns

```tsx
// Create reusable query options
const bookingQueryOptions = (id: string) => ({
  queryKey: ['booking', id],
  queryFn: () => fetchBooking(id),
  staleTime: 1000 * 60 * 5, // 5 minutes
});

// Use select to transform/filter data
const { data: activeBookings } = useQuery({
  ...bookingsQueryOptions,
  select: (data) => data.filter(b => b.status === 'active'),
});
```

## Avoid Request Waterfalls

```tsx
// BAD: Sequential requests
const user = await fetchUser();
const bookings = await fetchBookings(user.id);

// GOOD: Parallel when possible, or restructure API
const [user, bookings] = await Promise.all([
  fetchUser(),
  fetchBookingsByEmail(email), // If user.id isn't needed
]);
```

## Best Practices

- Create reusable query options objects
- Use `select` to project only needed data
- Let React Query handle request abort signals
- Don't duplicate server state in local state
