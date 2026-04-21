import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";

export type TClient = SupabaseClient<Database>;
export type { Database };

// Org scope — exactly one of the two variants. `allOrganizations: true` is
// reserved for super-admin "View All" flows and must never be passed by
// default: keeping it explicit makes audits trivial.
export type OrgScope =
  | { organizationId: string; allOrganizations?: never }
  | { organizationId?: never; allOrganizations: true };
