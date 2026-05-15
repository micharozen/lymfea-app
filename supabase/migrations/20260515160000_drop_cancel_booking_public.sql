-- Remove legacy RPC that cancelled in DB without Stripe settlement (superseded by cancel-booking edge function).
DROP FUNCTION IF EXISTS public.cancel_booking_public(text);
