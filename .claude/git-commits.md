# Git & Commits Rules

## Conventional Commits Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

## Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no code change |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or correcting tests |
| `build` | Changes to build system or dependencies |
| `chore` | Other changes that don't modify src or test files |

## Rules

- Subject line: max 50 characters, imperative mood, no period
- Body: wrap at 72 characters, explain what and why (not how)
- Use present tense: "add feature" not "added feature"

## Examples

```
feat(booking): add cancellation flow with refund options

fix(auth): resolve session expiration on mobile browsers

refactor(components): extract common table pagination logic

docs(api): update Supabase RLS policy documentation

chore(deps): update React to v18.3
```

## Scopes (Examples)

- `booking` - Booking-related changes
- `auth` - Authentication
- `admin` - Admin dashboard
- `pwa` - Mobile PWA
- `ui` - UI components
- `api` - API/Supabase changes
- `i18n` - Translations
- `deps` - Dependencies
