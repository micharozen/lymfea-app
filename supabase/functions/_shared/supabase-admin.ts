import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// On laisse SUPABASE_URL, c'est Supabase qui l'injectera automatiquement !
export const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);