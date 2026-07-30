// Shared authorization for venue-scoped admin actions.
//
// Same rule as payment-config-upsert: platform admins can act on any venue,
// concierges only on the venues they are assigned to.
//
// The JWT is decoded without signature verification on purpose — the Supabase
// gateway already verified it (these functions run with verify_jwt = true).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export interface VenueAuthz {
  userId: string;
  isAdmin: boolean;
}

export class VenueAuthzError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "VenueAuthzError";
    this.status = status;
  }
}

/** Extract the `sub` claim from a `Bearer <jwt>` header. */
export function userIdFromAuthHeader(authHeader: string | null): string {
  if (!authHeader) throw new VenueAuthzError(401, "Unauthorized");

  const parts = authHeader.replace("Bearer ", "").split(".");
  if (parts.length !== 3) throw new VenueAuthzError(401, "Invalid token");

  let payload: { sub?: string };
  try {
    payload = JSON.parse(atob(parts[1]));
  } catch {
    throw new VenueAuthzError(401, "Invalid token payload");
  }

  if (!payload.sub) throw new VenueAuthzError(401, "Invalid auth");
  return payload.sub;
}

/** Throws unless the caller may administer `hotelId`. */
export async function requireVenueAccess(
  supabase: SupabaseClient,
  authHeader: string | null,
  hotelId: string,
): Promise<VenueAuthz> {
  const userId = userIdFromAuthHeader(authHeader);

  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error) throw new VenueAuthzError(500, "Failed to verify role");

  const roleNames = (roles ?? []).map((r) => r.role);
  const isAdmin = roleNames.includes("admin");

  if (isAdmin) return { userId, isAdmin: true };

  if (roleNames.includes("concierge")) {
    const { data: assignedHotels } = await supabase.rpc(
      "get_concierge_hotels",
      { _user_id: userId },
    );
    const ids: string[] = Array.isArray(assignedHotels)
      ? assignedHotels.map((row: { hotel_id: string }) => row.hotel_id)
      : [];
    if (ids.includes(hotelId)) return { userId, isAdmin: false };
  }

  throw new VenueAuthzError(403, "Forbidden — not authorized for this venue");
}
