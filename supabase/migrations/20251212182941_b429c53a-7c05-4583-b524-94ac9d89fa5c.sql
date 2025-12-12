-- Add default UUID generation for hotels.id column
-- This allows Supabase to auto-generate the ID when not provided
ALTER TABLE public.hotels 
ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;