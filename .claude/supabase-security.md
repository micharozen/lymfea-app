# Supabase & Security Rules

## Row Level Security (RLS)

- **Always enable RLS** on tables exposed via the Data API
- Never use `user_metadata` in RLS policies (users can modify it)
- Always specify the `authenticated` role explicitly:

```sql
-- GOOD
CREATE POLICY "Users can read own data"
ON users FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- BAD (allows anon access)
CREATE POLICY "Users can read own data"
ON users FOR SELECT
USING (auth.uid() = id);
```

- Add indexes on columns used in policies for performance:

```sql
CREATE INDEX idx_bookings_user_id ON bookings(user_id);
```

- Keep policies simple - avoid complex JOINs
- Optimize subqueries - filter by user first:

```sql
-- GOOD: Filter by user first
team_id IN (SELECT team_id FROM team_user WHERE user_id = auth.uid())

-- BAD: Checks team_id for each row
auth.uid() IN (SELECT user_id FROM team_user WHERE team_user.team_id = table.team_id)
```

## API Security

- **Never expose `service_role` keys** in client-side code
- Store all keys in environment variables (`VITE_*` for client-accessible)
- Validate data at system boundaries (user input, external APIs)
- Use private schema for tables that shouldn't be exposed via Data API
