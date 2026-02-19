-- Migration: Rename hairdresser tables to Lymfea naming + create backward-compatible views
-- The views allow the frontend to continue using old table/column names without changes.
-- Simple single-table views are auto-updatable in PostgreSQL (INSERT/UPDATE/DELETE work).

-- ============================================
-- 1. hairdressers → therapists
-- ============================================
ALTER TABLE hairdressers RENAME TO therapists;

CREATE VIEW hairdressers AS SELECT * FROM therapists;
GRANT ALL ON hairdressers TO anon, authenticated, service_role;

-- ============================================
-- 2. hairdresser_hotels → therapist_venues
-- ============================================
ALTER TABLE hairdresser_hotels RENAME TO therapist_venues;
ALTER TABLE therapist_venues RENAME COLUMN hairdresser_id TO therapist_id;

CREATE VIEW hairdresser_hotels AS
  SELECT id, therapist_id AS hairdresser_id, hotel_id, created_at
  FROM therapist_venues;
GRANT ALL ON hairdresser_hotels TO anon, authenticated, service_role;

-- ============================================
-- 3. hairdresser_payouts → therapist_payouts
-- ============================================
ALTER TABLE hairdresser_payouts RENAME TO therapist_payouts;
ALTER TABLE therapist_payouts RENAME COLUMN hairdresser_id TO therapist_id;

CREATE VIEW hairdresser_payouts AS
  SELECT id, organization_id, therapist_id AS hairdresser_id, booking_id,
         amount, stripe_transfer_id, status, error_message, created_at, updated_at
  FROM therapist_payouts;
GRANT ALL ON hairdresser_payouts TO anon, authenticated, service_role;

-- ============================================
-- 4. hairdresser_ratings → therapist_ratings
-- ============================================
ALTER TABLE hairdresser_ratings RENAME TO therapist_ratings;
ALTER TABLE therapist_ratings RENAME COLUMN hairdresser_id TO therapist_id;

CREATE VIEW hairdresser_ratings AS
  SELECT id, booking_id, therapist_id AS hairdresser_id, rating, comment,
         rating_token, created_at, submitted_at
  FROM therapist_ratings;
GRANT ALL ON hairdresser_ratings TO anon, authenticated, service_role;
