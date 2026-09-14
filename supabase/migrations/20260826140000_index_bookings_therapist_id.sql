-- Index manquants pour le PWA thérapeute.
--
-- Le planning (/pwa/bookings) et le tableau de bord (/pwa/dashboard) filtrent
-- bookings sur therapist_id, désormais combiné à une fenêtre glissante sur
-- booking_date. La baseline n'indexe que (hotel_id, booking_date) : côté
-- thérapeute chaque écran faisait un seq scan sur toute la table.
--
-- Pas de CONCURRENTLY : le CLI Supabase enveloppe chaque migration dans une
-- transaction, où CREATE INDEX CONCURRENTLY est interdit.

-- Le prédicat partiel est sûr : Postgres prouve que therapist_id = $1 implique
-- therapist_id IS NOT NULL, donc l'index reste utilisable par la requête.
CREATE INDEX IF NOT EXISTS idx_bookings_therapist_date
  ON public.bookings (therapist_id, booking_date)
  WHERE therapist_id IS NOT NULL;

-- Fil des demandes en attente du dashboard : (hotel_id, booking_date) est déjà
-- couvert par idx_bookings_hotel_date, ce partiel restreint aux lignes 'pending'.
CREATE INDEX IF NOT EXISTS idx_bookings_pending
  ON public.bookings (hotel_id, booking_date)
  WHERE status = 'pending';
