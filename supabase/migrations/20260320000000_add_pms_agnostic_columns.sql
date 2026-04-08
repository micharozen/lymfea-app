-- Add PMS-agnostic columns to hotel_pms_configs
-- These generic columns support Mews and future PMS integrations
-- without PMS-specific prefixes.

-- New generic columns
ALTER TABLE hotel_pms_configs
  ADD COLUMN IF NOT EXISTS access_token TEXT,
  ADD COLUMN IF NOT EXISTS service_id TEXT,
  ADD COLUMN IF NOT EXISTS accounting_category_id TEXT,
  ADD COLUMN IF NOT EXISTS api_url TEXT;

-- Make Opera-specific columns nullable (they are NOT needed for Mews)
ALTER TABLE hotel_pms_configs
  ALTER COLUMN gateway_url DROP NOT NULL,
  ALTER COLUMN client_id DROP NOT NULL,
  ALTER COLUMN client_secret DROP NOT NULL,
  ALTER COLUMN app_key DROP NOT NULL,
  ALTER COLUMN enterprise_id DROP NOT NULL,
  ALTER COLUMN pms_hotel_id DROP NOT NULL;

-- Connection status tracking
ALTER TABLE hotel_pms_configs
  ADD COLUMN IF NOT EXISTS connection_status TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS connection_verified_at TIMESTAMPTZ;

-- Add comments
COMMENT ON COLUMN hotel_pms_configs.connection_status IS 'Last test result: connected, failed, unknown';
COMMENT ON COLUMN hotel_pms_configs.connection_verified_at IS 'Timestamp of last successful connection test';
COMMENT ON COLUMN hotel_pms_configs.access_token IS 'Mews: per-property AccessToken';
COMMENT ON COLUMN hotel_pms_configs.service_id IS 'Mews: Spa ServiceId for posting charges';
COMMENT ON COLUMN hotel_pms_configs.accounting_category_id IS 'Mews: accounting category for spa charges (optional)';
COMMENT ON COLUMN hotel_pms_configs.api_url IS 'API base URL (Mews: api.mews.com or api.mews-demo.com)';
