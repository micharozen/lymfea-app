import { createClient } from "@supabase/supabase-js";

/**
 * Supabase admin client (service role).
 * Used for server-side operations that bypass RLS.
 * Equivalent to: supabase/functions/_shared/supabase-admin.ts
 */
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

/**
 * Create a Supabase client scoped to a specific user's JWT.
 * This respects RLS policies for that user.
 */
export function supabaseForUser(accessToken: string) {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    }
  );
}
