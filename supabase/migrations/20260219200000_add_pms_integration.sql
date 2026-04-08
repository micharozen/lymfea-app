-- PMS Integration: Opera Cloud (and future PMS systems)
-- Creates a dedicated table for PMS credentials (isolated from hotels table)
-- Adds lightweight flags on hotels + tracking columns on bookings

-- 1. Dedicated PMS config table (credentials isolated, admin-only access)
CREATE TABLE IF NOT EXISTS public.hotel_pms_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id TEXT NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  pms_type TEXT NOT NULL DEFAULT 'opera_cloud',
  -- Opera Cloud credentials
  gateway_url TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  app_key TEXT NOT NULL,
  enterprise_id TEXT NOT NULL,
  pms_hotel_id TEXT NOT NULL,
  -- Feature flags
  auto_charge_room BOOLEAN DEFAULT false,
  guest_lookup_enabled BOOLEAN DEFAULT false,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(hotel_id)
);

ALTER TABLE public.hotel_pms_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage PMS configs"
  ON public.hotel_pms_configs
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2. Lightweight flags on hotels (avoid joining hotel_pms_configs for every request)
ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS pms_type TEXT DEFAULT NULL;
ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS pms_auto_charge_room BOOLEAN DEFAULT false;
ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS pms_guest_lookup_enabled BOOLEAN DEFAULT false;

-- 3. PMS charge tracking on bookings
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS pms_charge_status TEXT DEFAULT NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS pms_charge_id TEXT DEFAULT NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS pms_error_message TEXT DEFAULT NULL;
