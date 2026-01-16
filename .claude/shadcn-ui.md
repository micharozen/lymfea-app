# shadcn/ui Rules

## Customization

- Customize components in `components/ui/`
- Extend components rather than modifying core functionality
- Use the variant system with `cva` for consistent styling:

```tsx
const buttonVariants = cva("base-classes", {
  variants: {
    variant: { default: "...", destructive: "..." },
    size: { default: "...", sm: "...", lg: "..." },
  },
});
```

- Follow the background/foreground convention for colors

## Accessibility

- Preserve ARIA attributes from Radix UI primitives
- Use semantic HTML elements
- Ensure keyboard navigation works
- Test with screen readers when possible

## Best Practices

- Don't modify the core shadcn/ui components directly
- Create wrapper components for project-specific customizations
- Use the `cn()` utility for class merging
- Keep component APIs consistent with shadcn/ui patterns
