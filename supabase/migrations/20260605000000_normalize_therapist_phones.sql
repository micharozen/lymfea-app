-- Normalize therapists.phone storage and prevent re-introduction of dirty formats.
--
-- Context: send-otp normalizes phone numbers in JS before comparing (strips
-- whitespace and a leading 0), but verify-otp used a strict SQL equality check,
-- so any row stored as "0612345678" or "06 12 34 56 78" would receive an SMS
-- yet fail OTP verification with THERAPIST_NOT_FOUND. We:
--   1. Dedupe a known duplicate row (Christine Chantelat — same user_id, same
--      venue, kept the older active row).
--   2. Normalize every existing phone to the canonical 9-digit form.
--   3. Enforce the canonical form going forward with a CHECK constraint and a
--      partial unique index on (country_code, phone).

BEGIN;

-- 1. Dedupe Christine Chantelat (same user_id, same hotel — verified manually).
--    Keep the original active row (32884185...) and drop the duplicate pending one.
DELETE FROM therapist_venues
WHERE id = '4236a41c-9039-4259-b12b-d9f974bb3e22'
  AND therapist_id = '152623a0-fce7-41f6-ab37-a48697da924b';

DELETE FROM therapists
WHERE id = '152623a0-fce7-41f6-ab37-a48697da924b';

-- 2. Normalize every stored phone: trim whitespace anywhere in the string and
--    strip a single leading 0. Empty results become NULL so the CHECK can pass.
UPDATE therapists
SET phone = NULLIF(regexp_replace(regexp_replace(phone, '\s', '', 'g'), '^0', ''), '')
WHERE phone IS NOT NULL
  AND phone <> NULLIF(regexp_replace(regexp_replace(phone, '\s', '', 'g'), '^0', ''), '');

-- 3. CHECK: canonical phone is digits only and never starts with 0.
ALTER TABLE therapists
  ADD CONSTRAINT therapists_phone_normalized_chk
  CHECK (phone IS NULL OR phone ~ '^[1-9][0-9]+$');

-- 4. Prevent future duplicates on (country_code, phone).
CREATE UNIQUE INDEX therapists_country_code_phone_key
  ON therapists (country_code, phone)
  WHERE phone IS NOT NULL;

COMMIT;
