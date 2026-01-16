# Naming Conventions

## Summary Table

| Type | Convention | Example |
|------|------------|---------|
| Component files | kebab-case | `user-profile.tsx` |
| Components | PascalCase | `UserProfile` |
| Functions/Variables | camelCase | `getUserData` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| Booleans | is/has/should prefix | `isLoading`, `hasError` |
| Hooks | use prefix | `useUserData` |
| Types/Interfaces | PascalCase | `UserProfile` |
| Zod schemas | camelCase + Schema | `userProfileSchema` |
| i18n keys | camelCase dot notation | `booking.confirmTitle` |
| CSS classes | Tailwind utilities | `bg-primary text-sm` |
| Database tables | snake_case | `booking_treatments` |
| Database columns | snake_case | `created_at` |
| API endpoints | kebab-case | `/api/user-bookings` |
| Environment variables | UPPER_SNAKE_CASE | `VITE_SUPABASE_URL` |

## Detailed Rules

### Files & Folders

- Component files: `kebab-case.tsx`
- Hook files: `use-hook-name.ts`
- Utility files: `kebab-case.ts`
- Test files: `component-name.test.tsx`
- Type files: `types.ts` or `component-name.types.ts`

### React

- Components: `PascalCase`
- Props interfaces: `ComponentNameProps`
- Hooks: `useHookName`
- Event handlers: `handleEventName` or `onEventName`
- State setters: `setStateName`

### TypeScript

- Interfaces: `PascalCase` (prefer for objects)
- Types: `PascalCase` (prefer for unions/primitives)
- Generics: Single uppercase letter or descriptive (`T`, `TData`, `TError`)
- Enums: `PascalCase` with `UPPER_SNAKE_CASE` values

### Database (Supabase)

- Tables: `snake_case` plural (`bookings`, `booking_treatments`)
- Columns: `snake_case` (`created_at`, `user_id`)
- Foreign keys: `related_table_id` (`hotel_id`, `hairdresser_id`)
