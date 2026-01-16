-- Standardize all status values to lowercase English ('active', 'inactive')
-- This ensures consistency across all entities

-- Hotels
UPDATE public.hotels SET status = 'active' WHERE LOWER(status) IN ('actif', 'active');
UPDATE public.hotels SET status = 'inactive' WHERE LOWER(status) IN ('inactif', 'inactive');
UPDATE public.hotels SET status = 'pending' WHERE LOWER(status) IN ('en attente', 'pending');

-- Hairdressers
UPDATE public.hairdressers SET status = 'active' WHERE LOWER(status) IN ('actif', 'active');
UPDATE public.hairdressers SET status = 'inactive' WHERE LOWER(status) IN ('inactif', 'inactive');

-- Trunks
UPDATE public.trunks SET status = 'active' WHERE LOWER(status) IN ('actif', 'active', 'available');
UPDATE public.trunks SET status = 'inactive' WHERE LOWER(status) IN ('inactif', 'inactive');
UPDATE public.trunks SET status = 'maintenance' WHERE LOWER(status) IN ('maintenance');

-- Concierges
UPDATE public.concierges SET status = 'active' WHERE LOWER(status) IN ('actif', 'active');
UPDATE public.concierges SET status = 'inactive' WHERE LOWER(status) IN ('inactif', 'inactive');

-- Admins
UPDATE public.admins SET status = 'active' WHERE LOWER(status) IN ('actif', 'active');
UPDATE public.admins SET status = 'inactive' WHERE LOWER(status) IN ('inactif', 'inactive');

-- Treatment menus
UPDATE public.treatment_menus SET status = 'active' WHERE LOWER(status) IN ('actif', 'active');
UPDATE public.treatment_menus SET status = 'inactive' WHERE LOWER(status) IN ('inactif', 'inactive');
