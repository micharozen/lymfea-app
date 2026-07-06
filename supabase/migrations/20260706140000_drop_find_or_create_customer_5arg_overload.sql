-- Fix "function find_or_create_customer(...) is not unique"
--
-- Context: migration 20260623120000 consolidated find_or_create_customer down to
-- a single 5-arg signature (_phone, _first_name, _last_name, _email, _language).
-- Migration 20260630130100 then added an optional _civility via CREATE OR REPLACE
-- on the 6-arg signature — which does NOT replace the 5-arg one but creates a
-- second overload. Both overloads carry DEFAULTs, so a 5-arg call becomes
-- ambiguous ("function is not unique"), breaking customer/booking creation.
--
-- Fix: drop the stale 5-arg overload. The 6-arg version (_civility DEFAULT NULL)
-- covers every caller, whether or not they pass a civility.

DROP FUNCTION IF EXISTS public.find_or_create_customer(text, text, text, text, text);
