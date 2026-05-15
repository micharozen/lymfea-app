-- Optional custom cancellation policy copy shown in cancel modal (FR/EN)
ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS cancellation_policy_text_fr TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_policy_text_en TEXT;
