-- Fix infinite recursion between bookings and customers RLS policies.
--
-- Migration 20260429120000_scope_concierge_to_venue introduced a policy on
-- public.customers whose USING clause runs `EXISTS (SELECT ... FROM bookings
-- WHERE customer_id = customers.id ...)`.
--
-- An earlier migration (20260416000001_customer_portal_auth) had already
-- created a policy on public.bookings whose USING clause runs
-- `customer_id IN (SELECT id FROM customers WHERE auth_user_id = auth.uid())`.
--
-- Postgres evaluates RLS recursively: reading bookings checks customers
-- policies, which read bookings, which check customers — `42P17 infinite
-- recursion detected in policy for relation "bookings"`.
--
-- Fix: replace the cross-table EXISTS with a SECURITY DEFINER function that
-- bypasses RLS when checking whether a customer has a booking in one of the
-- concierge's hotels.

CREATE OR REPLACE FUNCTION public.customer_has_booking_in_concierge_hotels(
  _customer_id uuid,
  _user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.customer_id = _customer_id
      AND b.hotel_id IN (
        SELECT hotel_id FROM public.get_concierge_hotels(_user_id)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.customer_has_booking_in_concierge_hotels(uuid, uuid)
  TO authenticated;

DROP POLICY IF EXISTS "Concierges can view customers from their hotels" ON public.customers;

CREATE POLICY "Concierges can view customers from their hotels"
  ON public.customers FOR SELECT
  USING (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND public.customer_has_booking_in_concierge_hotels(customers.id, auth.uid())
  );
