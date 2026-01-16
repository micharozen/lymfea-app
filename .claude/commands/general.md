# Global Commit Command

Create a git commit with the `[GLOBAL]` tag prefix for changes that affect multiple parts of the codebase.

## Instructions

1. Run `git status` to see all modified files
2. Run `git diff --stat` to see a summary of changes
3. Stage all relevant changes with `git add`
4. Create a commit with the format: `[GLOBAL] <type>(<scope>): <description>`
5. The commit message should follow conventional commits format
6. Always include `Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>` at the end

## Commit Format

```
[GLOBAL] <type>(<scope>): <description>

<optional body explaining what and why>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

## Types

- `feat` - New feature
- `fix` - Bug fix
- `refactor` - Code refactoring
- `docs` - Documentation
- `chore` - Maintenance tasks
- `style` - Formatting changes
