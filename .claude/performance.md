# Performance Rules

## Memoization Guidelines

```tsx
// Use React.memo for components that receive stable props
const ExpensiveList = React.memo(({ items }: Props) => {
  return items.map(item => <Item key={item.id} {...item} />);
});

// Use useMemo for expensive calculations
const sortedItems = useMemo(
  () => items.sort((a, b) => a.name.localeCompare(b.name)),
  [items]
);

// Use useCallback when passing functions to memoized children
const handleClick = useCallback((id: string) => {
  setSelected(id);
}, []);
```

## When to Use Memoization

**DO memoize when:**
- Component receives stable props but parent re-renders often
- Calculation is expensive (sorting large arrays, complex transforms)
- Passing callbacks to memoized child components

**DON'T memoize when:**
- Component is simple and fast to render
- Props change frequently anyway
- You haven't profiled and confirmed a performance issue

## General Performance Tips

- **Profile first** - use React DevTools Profiler before optimizing
- **Avoid anonymous functions in JSX** when passing to children
- **Use code splitting** with `React.lazy` and `Suspense`
- **Virtualize large lists** with `react-window` or similar
- **Eliminate request waterfalls** - parallelize independent fetches
- **Reduce bundle size** - check imports, use tree-shaking

## React 19+ Note

The React Compiler (React 19+) automatically memoizes components and values. Manual memoization may become unnecessary, but architectural issues still matter.
