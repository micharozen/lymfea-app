import { Hono } from "hono";
import { supabaseAdmin } from "../../lib/supabase";
import { requireScope } from "../../middleware/apiKey";
import {
  UUID_RE,
  parsePagination,
  resolveVenueIdentifier,
} from "./_helpers";

/**
 * Nested customer endpoints under /v1/venues/{slug}/customers.
 *
 * Mounted from index.ts; the upstream apiKeyMiddleware has already populated
 * the API key context. Tenant isolation is enforced via resolveVenueIdentifier
 * before any data query.
 */
const customers = new Hono();

// GET /v1/venues/:slug/customers
customers.get("/", requireScope("customers:read"), async (c) => {
  const slug = c.req.param("slug") ?? "";

  const resolved = await resolveVenueIdentifier(c, slug);
  if (resolved instanceof Response) return resolved;

  const { limit, page, offset } = parsePagination(
    {
      page: c.req.query("page"),
      limit: c.req.query("limit"),
    },
    { page: 1, limit: 50, maxLimit: 100 }
  );

  const { data, error } = await supabaseAdmin.rpc(
    "gateway_list_venue_customers",
    {
      _hotel_id: resolved.venueId,
      _limit: limit,
      _offset: offset,
    }
  );

  if (error) {
    console.error("GET /v1/venues/:slug/customers error:", error);
    return c.json({ error: "Failed to fetch customers" }, 500);
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const total = rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0;

  const items = rows.map((row) => ({
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    language: row.language,
    preferred_treatment_type: row.preferred_treatment_type,
    profile_completed: row.profile_completed,
    booking_count: Number(row.booking_count ?? 0),
    last_visit_date: row.last_visit_date,
    total_spent: {
      amount: row.total_spent_amount,
      currency: row.currency,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  return c.json({
    data: items,
    meta: { page, limit, total },
  });
});

// GET /v1/venues/:slug/customers/:customer_id/bookings
customers.get(
  "/:customer_id/bookings",
  requireScope("bookings:read"),
  async (c) => {
    const slug = c.req.param("slug") ?? "";
    const customerId = c.req.param("customer_id") ?? "";

    if (!UUID_RE.test(customerId)) {
      return c.json({ error: "Customer not found" }, 404);
    }

    const resolved = await resolveVenueIdentifier(c, slug);
    if (resolved instanceof Response) return resolved;

    const { limit, page, offset } = parsePagination(
      {
        page: c.req.query("page"),
        limit: c.req.query("limit"),
      },
      { page: 1, limit: 20, maxLimit: 100 }
    );

    const { data, error } = await supabaseAdmin.rpc(
      "gateway_list_customer_bookings",
      {
        _customer_id: customerId,
        _hotel_id: resolved.venueId,
        _limit: limit,
        _offset: offset,
      }
    );

    if (error) {
      console.error(
        "GET /v1/venues/:slug/customers/:id/bookings error:",
        error
      );
      return c.json({ error: "Failed to fetch bookings" }, 500);
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const total = rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0;

    // Do not leak the existence of a customer outside this venue's scope.
    if (page === 1 && total === 0) {
      return c.json({ error: "Customer not found in this venue" }, 404);
    }

    const items = rows.map((row) => ({
      id: row.id,
      booking_number: row.booking_number,
      booking_date: row.booking_date,
      booking_time: row.booking_time,
      duration: row.duration,
      status: row.status,
      payment_method: row.payment_method,
      payment_status: row.payment_status,
      client_type: row.client_type,
      total_price: {
        amount: row.total_price,
        currency: row.currency,
      },
      room_number: row.room_number,
      treatments: Array.isArray(row.treatments) ? row.treatments : [],
      created_at: row.created_at,
    }));

    return c.json({
      data: items,
      meta: { page, limit, total },
    });
  }
);

export default customers;
