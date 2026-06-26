-- Per-treatment price override (special rate for a single booking line).
-- NULL = use catalog price (treatment_variants.price ?? treatment_menus.price).
-- A value forces the line price (absolute amount, not a delta).

ALTER TABLE booking_treatments ADD COLUMN IF NOT EXISTS price_override numeric DEFAULT NULL;

COMMENT ON COLUMN booking_treatments.price_override IS 'Admin override of this booking line price (absolute €). NULL = use catalog/variant price.';
