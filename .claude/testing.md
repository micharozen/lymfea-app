# Testing Rules

## Vitest + React Testing Library

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';

describe('BookingForm', () => {
  it('shows validation error for invalid email', async () => {
    render(<BookingForm />);

    const emailInput = screen.getByRole('textbox', { name: /email/i });
    await userEvent.type(emailInput, 'invalid-email');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
  });
});
```

## Best Practices

- **Test behavior, not implementation** - focus on user interactions
- **Use role-based queries** (`getByRole`) over class/ID selectors
- **Single responsibility** - one assertion focus per test
- **Handle async** with `findBy` queries or `waitFor`
- **Clean up** after each test (automatic with RTL)
- **Mock external dependencies** (Supabase, APIs)

## Query Priority

1. `getByRole` - accessible to everyone
2. `getByLabelText` - form fields
3. `getByPlaceholderText` - when no label
4. `getByText` - non-interactive elements
5. `getByTestId` - last resort

## File Naming

- Place tests next to the code: `booking-form.tsx` + `booking-form.test.tsx`
- Use descriptive test names that explain the expected behavior
- Group related tests with `describe` blocks
