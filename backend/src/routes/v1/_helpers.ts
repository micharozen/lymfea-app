import { supabaseAdmin } from "../../lib/supabase";
import type { ApiKeyContext } from "../../middleware/apiKey";

export type Ctx = { get: (k: string) => unknown };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-_]{0,79}$/i;

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Returns the organization the key is restricted to, or null for legacy/platform-wide keys. */
export function scopedOrgId(c: Ctx): string | null {
  const apiKey = c.get("apiKey") as ApiKeyContext | undefined;
  return apiKey?.organizationId ?? null;
}

/** Legacy: returns the venue the key is restricted to (pre-org-scoping keys). */
export function scopedHotelId(c: Ctx): string | null {
  const apiKey = c.get("apiKey") as ApiKeyContext | undefined;
  return apiKey?.hotelId ?? null;
}

/**
 * Resolves a venue identifier (slug OR UUID) coming from the URL path to the
 * canonical `hotels.id` and asserts it belongs to the API key's organization.
 *
 * - Returns `{ venueId }` on success.
 * - Returns a `Response` (404 / 403 / 500) when the venue is unknown or
 *   out of scope; the caller should return it directly.
 *
 * Tenant isolation: org-scoped keys require `hotels.organization_id` to match
 * the key's `organizationId`. Legacy venue-scoped keys must match `hotelId`.
 */
export async function resolveVenueIdentifier(
  c: Ctx,
  slugOrId: string
): Promise<{ venueId: string } | Response> {
  // Reject anything outside the allowed identifier shapes up-front. This both
  // short-circuits obvious 404s and prevents injection into the PostgREST
  // .or() filter (which is a comma-separated string of filter expressions).
  if (!UUID_RE.test(slugOrId) && !SLUG_RE.test(slugOrId)) {
    return jsonError(404, "Venue not found");
  }

  const { data, error } = await supabaseAdmin
    .from("hotels")
    .select("id, organization_id, slug")
    .or(`id.eq.${slugOrId},slug.eq.${slugOrId}`)
    .maybeSingle();

  if (error) {
    console.error("resolveVenueIdentifier lookup error:", error);
    return jsonError(500, "Failed to verify venue");
  }

  if (!data) {
    return jsonError(404, "Venue not found");
  }

  const orgId = scopedOrgId(c);
  const hotelId = scopedHotelId(c);

  if (orgId) {
    if (data.organization_id !== orgId) {
      return jsonError(403, "Forbidden");
    }
  } else if (hotelId && hotelId !== data.id) {
    return jsonError(403, "Forbidden");
  }

  return { venueId: data.id };
}

/** Parses a positive integer query param with min/max/default. */
export function parsePagination(
  raw: { page?: string; limit?: string },
  defaults: { page: number; limit: number; maxLimit: number }
): { page: number; limit: number; offset: number } {
  const pageNum = Number.parseInt(raw.page ?? "", 10);
  const limitNum = Number.parseInt(raw.limit ?? "", 10);

  const page =
    Number.isFinite(pageNum) && pageNum >= 1 ? pageNum : defaults.page;
  const limit =
    Number.isFinite(limitNum) && limitNum >= 1
      ? Math.min(limitNum, defaults.maxLimit)
      : defaults.limit;

  return { page, limit, offset: (page - 1) * limit };
}

export { UUID_RE };
