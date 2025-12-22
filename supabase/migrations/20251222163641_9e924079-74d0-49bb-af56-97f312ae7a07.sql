-- Update default status to French
ALTER TABLE public.bookings ALTER COLUMN status SET DEFAULT 'En attente';