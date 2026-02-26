-- Add language preference to profiles for authenticated users
-- NULL means fallback to localStorage/browser detection (backward compatible)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS language TEXT DEFAULT NULL
  CHECK (language IS NULL OR language IN ('fr', 'en'));
