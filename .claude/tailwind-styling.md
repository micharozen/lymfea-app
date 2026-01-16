# Tailwind CSS & Styling Rules

## Conventions

- Use semantic color names defined in the theme:
  - `primary`, `secondary`, `destructive`, `success`, `warning`, `info`, `accent`
  - `background`, `foreground`, `muted`, `card`, `popover`, `border`

- Use the `cn()` utility for conditional class merging:

```tsx
import { cn } from "@/lib/utils";

<div className={cn("base-classes", isActive && "active-classes")} />
```

- Avoid premature `@apply` - prefer React components for reusability
- Define design tokens in `tailwind.config.js`, not inline

## Best Practices

- Extract repeated patterns into reusable components
- Follow the background/foreground convention for color pairs
- Use responsive prefixes consistently (`sm:`, `md:`, `lg:`)
- Prefer Tailwind utilities over custom CSS
- Centralize theme configuration in `tailwind.config.js`
