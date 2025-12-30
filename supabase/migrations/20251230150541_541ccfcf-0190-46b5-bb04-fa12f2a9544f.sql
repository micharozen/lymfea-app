-- Add quote_pending visibility rule for hairdressers
-- This ensures hairdressers cannot see bookings with status 'quote_pending'
-- Note: The existing RLS policies use status = 'pending' for hairdressers, so we don't need to modify them
-- since 'quote_pending' will naturally be excluded from their view.

-- For admins, the existing "Admins can view all bookings" policy already allows them to see all statuses including quote_pending.

-- No structural changes needed - the booking status is stored as TEXT so 'quote_pending' is already supported.