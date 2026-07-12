-- ==============================================================================
-- Resume link for abandoned checkouts:
--   - checkout_intents.resume_token (stable per open intent)
--   - RPC resume_checkout_intent (anon — the guest is not authenticated)
-- ==============================================================================

ALTER TABLE checkout_intents
  ADD COLUMN IF NOT EXISTS resume_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_checkout_intents_resume_token
  ON checkout_intents (resume_token);

-- ─── resume_checkout_intent (anon, token-gated) ──────────────────────────────
-- Returns the abandoned cart behind a reminder email link. The token is an
-- unguessable UUID and the intent is only exposed while it is still open and
-- recent, which bounds the window during which the guest's name and email are
-- readable by whoever holds the link.
CREATE OR REPLACE FUNCTION resume_checkout_intent(_token UUID)
RETURNS TABLE (
  hotel_id          TEXT,
  hotel_slug        TEXT,
  cart_snapshot     JSONB,
  booking_date      DATE,
  booking_time      TIME,
  room_number       TEXT,
  client_first_name TEXT,
  client_last_name  TEXT,
  client_email      TEXT,
  language          TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ci.hotel_id,
    h.slug,
    ci.cart_snapshot,
    ci.booking_date,
    ci.booking_time,
    ci.room_number,
    ci.client_first_name,
    ci.client_last_name,
    ci.client_email,
    ci.language
  FROM checkout_intents ci
  JOIN hotels h ON h.id = ci.hotel_id
  WHERE ci.resume_token = _token
    AND ci.converted_at IS NULL
    AND ci.created_at > now() - INTERVAL '30 days';
$$;

REVOKE ALL ON FUNCTION resume_checkout_intent(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resume_checkout_intent(UUID) TO anon, authenticated, service_role;
