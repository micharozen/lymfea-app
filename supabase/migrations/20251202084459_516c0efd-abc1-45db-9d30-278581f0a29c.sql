-- Add unique constraint on phone number + country code for hairdressers
-- This ensures each hairdresser has a unique phone number

-- First, let's identify and handle any existing duplicates
-- We'll keep the oldest record for each duplicate phone number
WITH duplicate_phones AS (
  SELECT phone, country_code, MIN(created_at) as oldest_created_at
  FROM hairdressers
  GROUP BY phone, country_code
  HAVING COUNT(*) > 1
)
UPDATE hairdressers h
SET phone = h.phone || '_duplicate_' || h.id::text
FROM duplicate_phones dp
WHERE h.phone = dp.phone 
  AND h.country_code = dp.country_code
  AND h.created_at > dp.oldest_created_at;

-- Now add the unique constraint
ALTER TABLE hairdressers
ADD CONSTRAINT hairdressers_phone_country_code_unique 
UNIQUE (phone, country_code);