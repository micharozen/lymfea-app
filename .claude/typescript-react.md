# TypeScript & React Rules

## Type Safety

- Prefer `unknown` over `any` - if truly needed, document why
- Define explicit types for props using `interface` or `type`
- Use `z.infer<typeof schema>` to infer types from Zod schemas
- Prefer discriminated unions to eliminate optional props
- Never use `@ts-ignore` - fix the underlying issue instead
- Avoid type assertions (`as`) - they silence the compiler without runtime checks

## Component Architecture

- Functional components only (no class components)
- Keep components focused and single-purpose
- Extract complex logic into custom hooks
- Pass only necessary props - don't pass entire objects when only a few fields are needed

## useEffect - Use Sparingly

**Only use `useEffect` when truly necessary.** Most of the time, you don't need it.

### When NOT to use useEffect

```tsx
// BAD: Derived state in useEffect
const [fullName, setFullName] = useState('');
useEffect(() => {
  setFullName(`${firstName} ${lastName}`);
}, [firstName, lastName]);

// GOOD: Calculate during render
const fullName = `${firstName} ${lastName}`;
```

```tsx
// BAD: Fetching data triggered by event
useEffect(() => {
  if (shouldFetch) {
    fetchData();
  }
}, [shouldFetch]);

// GOOD: Fetch in the event handler directly
const handleClick = async () => {
  const data = await fetchData();
  setData(data);
};
```

### When useEffect IS appropriate

- Synchronizing with external systems (subscriptions, WebSockets)
- Setting up event listeners on window/document
- Integrating with non-React libraries
- Analytics/logging on mount

### Prefer These Alternatives

| Instead of useEffect for... | Use... |
|----------------------------|--------|
| Derived/computed values | Calculate during render |
| Data fetching | TanStack Query / event handlers |
| Responding to events | Event handlers |
| Resetting state on prop change | `key` prop |
| Subscribing to stores | `useSyncExternalStore` |

## File Organization

- Maximum 2-3 levels of folder nesting
- Colocate related files (component + hook + types together)
- Place tests next to the code they test (`*.test.tsx`)
- Feature-based structure for larger features
- Separate UI (`/ui`) and forms (`/form`) components
