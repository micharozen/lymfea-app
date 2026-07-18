-- Les gestionnaires de lieu (concierge) ne voyaient pas le nom des clients dont la seule
-- activité est une réservation de commodité (piscine) : ces clients n'ont pas de ligne
-- `bookings`, seulement une `amenity_bookings`.
--
-- La policy SELECT concierge sur `customers`
-- (20260429130000_fix_concierge_customer_recursion) s'appuie sur
-- `customer_has_booking_in_concierge_hotels`, qui ne teste que `public.bookings`. Le concierge
-- voit donc le créneau piscine (il a le droit de lire `amenity_bookings`) mais le join vers
-- `customers` est refusé → nom vide, alors que l'admin le voit.
--
-- Fix : élargir la fonction pour reconnaître aussi une activité dans `amenity_bookings`.
-- On reste en SECURITY DEFINER (contourne la RLS, évite la récursion bookings⇄customers).
-- Le nom de la fonction est conservé pour ne pas toucher à la policy qui la référence.

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
      AND b.hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(_user_id))
  )
  OR EXISTS (
    SELECT 1
    FROM public.amenity_bookings a
    WHERE a.customer_id = _customer_id
      AND a.hotel_id IN (SELECT hotel_id FROM public.get_concierge_hotels(_user_id))
  );
$$;
