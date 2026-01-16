# i18next (Internationalization) Rules

## Key Naming

- Use camelCase consistently: `booking.confirmTitle`
- Maximum 2-3 levels of nesting
- Keep names descriptive and self-explanatory

## Namespaces

- `common` - Shared elements (buttons, labels, errors)
- `admin` - Admin dashboard translations
- `client` - Guest booking flow translations
- `pwa` - Mobile app translations

## Best Practices

```tsx
// GOOD: Use interpolation
t('booking.greeting', { name: userName })
// "Hello, {{name}}!"

// BAD: String concatenation (breaks in other languages)
t('hello') + ', ' + userName + '!'

// GOOD: Use pluralization
t('booking.items', { count: itemCount })
// items_one: "{{count}} item"
// items_other: "{{count}} items"
```

## Rules

- Never concatenate translated strings
- Use pluralization rules (`_one`, `_other`, `_zero`)
- Clean up orphan/unused translation keys regularly
- Keep translation files flat or max 2-3 levels deep
- Provide context for translators when needed
