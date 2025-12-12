-- Standardize bookings.status to English
UPDATE public.bookings SET status = 'pending' WHERE status IN ('En attente', 'Pending');
UPDATE public.bookings SET status = 'assigned' WHERE status IN ('Assigné', 'Assigned');
UPDATE public.bookings SET status = 'confirmed' WHERE status IN ('Confirmé', 'Confirmed');
UPDATE public.bookings SET status = 'completed' WHERE status IN ('Terminé', 'Completed');
UPDATE public.bookings SET status = 'cancelled' WHERE status IN ('Annulé', 'Cancelled', 'Canceled');
UPDATE public.bookings SET status = 'awaiting_validation' WHERE status IN ('En attente de validation');

-- Standardize trunks.status to English
UPDATE public.trunks SET status = 'active' WHERE status IN ('Actif', 'Active', 'Available', 'available');
UPDATE public.trunks SET status = 'maintenance' WHERE status IN ('Inactif', 'Inactive', 'Maintenance', 'maintenance');

-- Standardize hairdressers.status to English
UPDATE public.hairdressers SET status = 'active' WHERE status IN ('Actif', 'Active');
UPDATE public.hairdressers SET status = 'pending' WHERE status IN ('En attente', 'Pending');
UPDATE public.hairdressers SET status = 'inactive' WHERE status IN ('Inactif', 'Inactive');

-- Standardize concierges.status to English
UPDATE public.concierges SET status = 'active' WHERE status IN ('Actif', 'Active');
UPDATE public.concierges SET status = 'pending' WHERE status IN ('En attente', 'Pending');
UPDATE public.concierges SET status = 'inactive' WHERE status IN ('Inactif', 'Inactive');

-- Standardize admins.status to English
UPDATE public.admins SET status = 'active' WHERE status IN ('Actif', 'Active');
UPDATE public.admins SET status = 'pending' WHERE status IN ('En attente', 'Pending');
UPDATE public.admins SET status = 'inactive' WHERE status IN ('Inactif', 'Inactive');

-- Standardize treatment_menus.status to English
UPDATE public.treatment_menus SET status = 'active' WHERE status IN ('Actif', 'Active');
UPDATE public.treatment_menus SET status = 'inactive' WHERE status IN ('Inactif', 'Inactive');

-- Update default values for all tables
ALTER TABLE public.bookings ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.trunks ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE public.hairdressers ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.concierges ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.admins ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE public.treatment_menus ALTER COLUMN status SET DEFAULT 'active';