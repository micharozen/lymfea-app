import { Hono } from "hono";
import { supabaseAdmin } from "../../lib/supabase";
import { requireScope } from "../../middleware/apiKey";
import {
  resolveVenueIdentifier,
  scopedHotelId,
  scopedOrgId,
} from "./_helpers";
import customers from "./customers";

/**
 * Public external API (v1) for third-party applications.
 *
 * Authenticated upstream by apiKeyMiddleware (mounted on /v1/* in index.ts).
 * These endpoints are READ-ONLY and contain no business logic — they simply
 * fetch data from Supabase (reusing the existing public RPCs where possible)
 * and return clean JSON.
 *
 * Scope convention: "<resource>:read".
 */
const v1 = new Hono();

// Curated, safe subset of venue columns for the list endpoint.
const VENUE_LIST_FIELDS =
  "id,slug,name,name_en,image,cover_image,address,postal_code,city,country,currency,venue_type,description,description_en,timezone";

// GET /v1/venues — list active venues, scoped to the key's organization.
v1.get("/venues", requireScope("venues:read"), async (c) => {
  let query = supabaseAdmin
    .from("hotels")
    .select(VENUE_LIST_FIELDS)
    .ilike("status", "active")
    .order("name");

  const orgId = scopedOrgId(c);
  const hotelId = scopedHotelId(c);
  if (orgId) {
    query = query.eq("organization_id", orgId);
  } else if (hotelId) {
    query = query.eq("id", hotelId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("GET /v1/venues error:", error);
    return c.json({ error: "Failed to fetch venues" }, 500);
  }

  return c.json({ data });
});

// GET /v1/venues/:id — a single venue's public profile.
v1.get("/venues/:id", requireScope("venues:read"), async (c) => {
  const id = c.req.param("id") ?? "";

  const resolved = await resolveVenueIdentifier(c, id);
  if (resolved instanceof Response) return resolved;

  const { data, error } = await supabaseAdmin.rpc("get_public_hotel_by_id", {
    _hotel_id: resolved.venueId,
  });
  if (error) {
    console.error("GET /v1/venues/:id error:", error);
    return c.json({ error: "Failed to fetch venue" }, 500);
  }

  const venue = Array.isArray(data) ? data[0] : data;
  if (!venue) {
    return c.json({ error: "Venue not found" }, 404);
  }

  return c.json({ data: venue });
});

// GET /v1/venues/:id/treatments — the venue's public treatment menu.
v1.get("/venues/:id/treatments", requireScope("treatments:read"), async (c) => {
  const id = c.req.param("id") ?? "";

  const resolved = await resolveVenueIdentifier(c, id);
  if (resolved instanceof Response) return resolved;

  const { data, error } = await supabaseAdmin.rpc("get_public_treatments", {
    _hotel_id: resolved.venueId,
  });
  if (error) {
    console.error("GET /v1/venues/:id/treatments error:", error);
    return c.json({ error: "Failed to fetch treatments" }, 500);
  }

  return c.json({ data });
});

// Nested customer endpoints.
v1.route("/venues/:slug/customers", customers);

export default v1;
