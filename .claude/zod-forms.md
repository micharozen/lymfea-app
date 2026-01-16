# Zod & Forms Rules

## Schema Definition

```tsx
// Define schemas separately from components
const bookingSchema = z.object({
  guestName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  checkIn: z.date(),
  checkOut: z.date(),
}).refine(
  (data) => data.checkOut > data.checkIn,
  { message: "Check-out must be after check-in", path: ["checkOut"] }
);

// Infer TypeScript type from schema
type BookingFormData = z.infer<typeof bookingSchema>;
```

## React Hook Form Integration

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const form = useForm<BookingFormData>({
  resolver: zodResolver(bookingSchema),
  defaultValues: { guestName: "", email: "" },
});
```

## Best Practices

- Reuse schemas across client and server validation
- Use `refine` for single-field custom validation
- Use `superRefine` for cross-field validation
- Create custom hooks for reusable create/edit form patterns
- Define schemas in separate files for reusability
- Always infer TypeScript types from schemas (don't duplicate)
