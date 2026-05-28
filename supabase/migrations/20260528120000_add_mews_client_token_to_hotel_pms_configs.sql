-- Store Mews ClientToken per venue (Opera uses client_id/client_secret instead)
ALTER TABLE hotel_pms_configs
  ADD COLUMN IF NOT EXISTS client_token TEXT;

COMMENT ON COLUMN hotel_pms_configs.client_token IS 'Mews: per-property ClientToken (Connector API)';
