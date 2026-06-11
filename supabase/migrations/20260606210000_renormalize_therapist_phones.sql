-- Re-normalize therapists.phone with a stricter cleanup so the CHECK constraint
-- introduced in 20260605000000 can be re-applied on environments whose data
-- still contains '+', '.', '-', '(', '00…' prefixes, or other non-digit chars.
--
-- The previous migration's normalization only stripped whitespace and a single
-- leading 0. It succeeded on staging (because that snapshot happened to be
-- clean enough) but fails when applied to main, where therapists.phone holds
-- formats like "+33 6 12 34 56 78" or "06.12.34.56.78".
--
-- This migration is a no-op on already-clean environments: the UPDATE only
-- touches rows whose normalized form differs from the stored value, and the
-- CHECK is dropped + recreated identically.

BEGIN;

-- 1. Temporarily drop the strict CHECK so we can re-normalize legacy rows.
ALTER TABLE therapists
  DROP CONSTRAINT IF EXISTS therapists_phone_normalized_chk;

-- 2. Strip every non-digit character, then strip ALL leading zeros.
--    Empty results become NULL so the re-added CHECK can pass.
UPDATE therapists
SET phone = NULLIF(
  regexp_replace(regexp_replace(phone, '[^0-9]', '', 'g'), '^0+', ''),
  ''
)
WHERE phone IS NOT NULL
  AND phone IS DISTINCT FROM NULLIF(
    regexp_replace(regexp_replace(phone, '[^0-9]', '', 'g'), '^0+', ''),
    ''
  );

-- 3. Any phone too short to be valid is unusable for OTP anyway — null it
--    so it does not fail the length-2 minimum baked into the CHECK regex.
UPDATE therapists SET phone = NULL
WHERE phone IS NOT NULL AND length(phone) < 2;

-- 4. Re-add the CHECK (identical to the original definition).
ALTER TABLE therapists
  ADD CONSTRAINT therapists_phone_normalized_chk
  CHECK (phone IS NULL OR phone ~ '^[1-9][0-9]+$');

COMMIT;
