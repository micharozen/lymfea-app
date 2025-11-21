-- Add a column to track which hairdressers have declined a booking
ALTER TABLE public.bookings 
ADD COLUMN declined_by uuid[] DEFAULT '{}';

-- Add a comment to explain the column
COMMENT ON COLUMN public.bookings.declined_by IS 'Array of hairdresser IDs who have declined or unassigned from this booking';