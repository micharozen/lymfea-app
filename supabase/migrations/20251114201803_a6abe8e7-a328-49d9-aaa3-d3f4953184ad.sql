-- Add missing columns to hotels table
ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS cover_image TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS vat DECIMAL(5,2) DEFAULT 20.00,
  ADD COLUMN IF NOT EXISTS hotel_commission DECIMAL(5,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS hairdresser_commission DECIMAL(5,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';

-- Update existing records
UPDATE public.hotels SET status = 'Active' WHERE status IS NULL;