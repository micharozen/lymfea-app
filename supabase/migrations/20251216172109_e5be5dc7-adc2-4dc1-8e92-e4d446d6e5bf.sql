-- Add explicit policies to deny anonymous/public access to sensitive tables
-- These are RESTRICTIVE policies that require authentication

-- 1. Bookings - Block anonymous access explicitly
CREATE POLICY "Block anonymous access to bookings"
ON public.bookings
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);

-- 2. Hairdressers - Block anonymous access explicitly  
CREATE POLICY "Block anonymous access to hairdressers"
ON public.hairdressers
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);

-- 3. Admins - Block anonymous access explicitly
CREATE POLICY "Block anonymous access to admins"
ON public.admins
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);

-- 4. Concierges - Block anonymous access explicitly
CREATE POLICY "Block anonymous access to concierges"
ON public.concierges
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);

-- 5. Treatment Requests - Block anonymous SELECT (INSERT still allowed via function)
CREATE POLICY "Block anonymous select on treatment_requests"
ON public.treatment_requests
AS RESTRICTIVE
FOR SELECT
TO anon
USING (false);

CREATE POLICY "Block anonymous update on treatment_requests"
ON public.treatment_requests
AS RESTRICTIVE
FOR UPDATE
TO anon
USING (false);

CREATE POLICY "Block anonymous delete on treatment_requests"
ON public.treatment_requests
AS RESTRICTIVE
FOR DELETE
TO anon
USING (false);

-- 6. Hairdresser ratings - Block anonymous SELECT
CREATE POLICY "Block anonymous select on hairdresser_ratings"
ON public.hairdresser_ratings
AS RESTRICTIVE
FOR SELECT
TO anon
USING (false);

-- 7. Hotel ledger - Block anonymous access
CREATE POLICY "Block anonymous access to hotel_ledger"
ON public.hotel_ledger
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);

-- 8. Hairdresser payouts - Block anonymous access
CREATE POLICY "Block anonymous access to hairdresser_payouts"
ON public.hairdresser_payouts
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);

-- 9. Notifications - Block anonymous access
CREATE POLICY "Block anonymous access to notifications"
ON public.notifications
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);

-- 10. User roles - Block anonymous access
CREATE POLICY "Block anonymous access to user_roles"
ON public.user_roles
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);