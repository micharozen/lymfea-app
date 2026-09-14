-- ============================================================
-- Rattrapage des réservations de commodité sans ligne amenity_bookings.
--
-- Contexte : jusqu'au correctif de useCreateBookingMutation, le chemin
-- admin/concierge créait un booking portant un soin relié à un venue_amenity
-- sans jamais écrire la ligne amenity_bookings correspondante. Or la
-- disponibilité du site client se calcule exclusivement sur cette table
-- (_shared/availability-query.ts) : ces créneaux étaient réservés en base mais
-- proposés comme libres en ligne — à l'origine d'un double booking constaté sur
-- le bassin de l'Hôtel de Buci.
--
-- Portée : réservations À VENIR uniquement (booking_date >= CURRENT_DATE).
-- Le passé n'influence plus aucune disponibilité, et réécrire son historique de
-- facturation (price / payment_status) ferait plus de dégâts que de bien.
--
-- Idempotent : les deux étapes sont filtrées sur l'absence de ligne liée.
-- ============================================================

-- Lignes à créer, calculées comme le fait resolveLinkedAmenityLines côté client :
--   durée  = plus longue durée demandée pour cette commodité (variante > soin)
--   places = une par ligne de panier
--   prix   = somme des lignes (override > variante > soin)
CREATE TEMP TABLE _amenity_backfill ON COMMIT DROP AS
SELECT
  b.id                                   AS booking_id,
  b.hotel_id::text                       AS hotel_id,
  tm.amenity_id                          AS venue_amenity_id,
  b.booking_date,
  b.booking_time,
  MAX(COALESCE(tv.duration, tm.duration, b.duration, 60))::int AS duration,
  COUNT(*)::int                          AS num_guests,
  COALESCE(SUM(COALESCE(bt.price_override, tv.price, tm.price)), 0)::numeric AS price,
  b.customer_id,
  b.client_type,
  b.room_number,
  b.payment_method,
  b.payment_status
FROM bookings b
JOIN booking_treatments bt ON bt.booking_id = b.id
JOIN treatment_menus tm ON tm.id = bt.treatment_id
LEFT JOIN treatment_variants tv ON tv.id = bt.variant_id
WHERE tm.amenity_id IS NOT NULL
  AND b.booking_date >= CURRENT_DATE
  AND b.status NOT IN ('Annulé', 'Terminé', 'cancelled', 'completed', 'noshow')
  AND NOT EXISTS (
    SELECT 1 FROM amenity_bookings ab WHERE ab.linked_booking_id = b.id
  )
GROUP BY b.id, tm.amenity_id;

-- 1. Rattachement des saisies manuelles ---------------------------------------
-- Avant le correctif, le concierge doublait parfois la réservation d'une ligne
-- commodité saisie à la main. Insérer en plus consommerait deux fois la capacité :
-- on relie la ligne existante au booking, ce qui rétablit aussi la propagation
-- d'annulation (trigger propagate_booking_status_to_amenities).
-- Appariement strict — même commodité, même date, même heure de début — et
-- seulement quand il n'y a aucune ambiguïté (un booking ↔ une ligne orpheline).
WITH orphan AS (
  SELECT ab.id, ab.venue_amenity_id, ab.booking_date, ab.booking_time,
         COUNT(*) OVER (PARTITION BY ab.venue_amenity_id, ab.booking_date, ab.booking_time) AS peers
  FROM amenity_bookings ab
  WHERE ab.linked_booking_id IS NULL
    AND ab.status <> 'cancelled'
    AND ab.booking_date >= CURRENT_DATE
),
pairing AS (
  SELECT o.id AS amenity_booking_id, f.booking_id,
         COUNT(*) OVER (PARTITION BY o.id) AS booking_candidates
  FROM orphan o
  JOIN _amenity_backfill f
    ON f.venue_amenity_id = o.venue_amenity_id
   AND f.booking_date = o.booking_date
   AND f.booking_time = o.booking_time
  WHERE o.peers = 1
)
UPDATE amenity_bookings ab
SET linked_booking_id = p.booking_id,
    updated_at = NOW()
FROM pairing p
WHERE ab.id = p.amenity_booking_id
  AND p.booking_candidates = 1;

-- 2. Création des lignes manquantes -------------------------------------------
INSERT INTO amenity_bookings (
  hotel_id, venue_amenity_id, booking_date, booking_time, duration, end_time,
  customer_id, client_type, room_number, linked_booking_id, num_guests,
  price, payment_method, payment_status, status
)
SELECT
  f.hotel_id,
  f.venue_amenity_id,
  f.booking_date,
  f.booking_time,
  f.duration,
  (f.booking_time + make_interval(mins => f.duration))::time,
  f.customer_id,
  -- Même traduction que amenityClientTypeFromBooking : les deux colonnes
  -- client_type ont des domaines distincts.
  CASE f.client_type WHEN 'hotel' THEN 'internal' WHEN 'sezame' THEN 'sezame' ELSE 'external' END,
  NULLIF(f.room_number, 'TBD'),
  f.booking_id,
  f.num_guests,
  f.price,
  f.payment_method,
  -- Le chemin applicatif écrit 'offert' dès que le prix est nul ; ici la plupart
  -- des lignes à 0 sont en réalité des gratuités hôtel (charged_to_room) ou
  -- partenaire. On garde le statut réel du booking, la ligne commodité n'étant
  -- qu'un registre de capacité.
  COALESCE(f.payment_status, 'pending'),
  'confirmed'
FROM _amenity_backfill f
-- L'étape 1 vient peut-être de rattacher une ligne à ce booking.
WHERE NOT EXISTS (
  SELECT 1 FROM amenity_bookings ab WHERE ab.linked_booking_id = f.booking_id
);
