# OOM Hotel - Development Guidelines

This project uses modular Claude rules organized by topic.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Supabase (PostgreSQL + Auth + Real-time)
- **Styling**: Tailwind CSS + shadcn/ui
- **State Management**: TanStack Query (server state) + React Context (client state)
- **Forms**: React Hook Form + Zod
- **i18n**: i18next (EN/FR)
- **PWA**: vite-plugin-pwa + OneSignal
- **Package Manager**: Bun (NOT npm)

## Package Manager - Bun

**IMPORTANT**: This project uses **Bun** instead of npm/yarn/pnpm.

### Commands

| Task                 | Command                |
| -------------------- | ---------------------- |
| Install dependencies | `bun install`          |
| Add a package        | `bun add <package>`    |
| Add dev dependency   | `bun add -d <package>` |
| Remove a package     | `bun remove <package>` |
| Run dev server       | `bun dev`              |
| Build project        | `bun run build`        |
| Run scripts          | `bun run <script>`     |

### Rules

- **NEVER** use `npm`, `yarn`, or `pnpm` commands
- Always use `bun` for installing, building, and running scripts
- The lockfile is `bun.lockb` (binary format)

## Project Structure

```
src/
├── components/
│   ├── ui/           # shadcn/ui components
│   ├── admin/        # Admin-specific components
│   ├── client/       # Client flow components
│   └── pwa/          # Mobile PWA components
├── hooks/            # Custom React hooks
├── contexts/         # React Contexts
├── lib/              # Utility functions
├── pages/            # Route-level components
├── i18n/             # Translations
└── integrations/     # External service integrations
```

## Quick Reference Checklists

### File Creation

- [ ] Use kebab-case for filename
- [ ] Add TypeScript types/interfaces
- [ ] Include necessary imports
- [ ] Add translations if user-facing text
- [ ] Consider accessibility (ARIA, keyboard nav)

### Code Review

- [ ] No `any` types without justification
- [ ] No `@ts-ignore` or `@ts-expect-error`
- [ ] RLS policies use `authenticated` role
- [ ] No service keys in client code
- [ ] Translations use proper interpolation
- [ ] Components are accessible
