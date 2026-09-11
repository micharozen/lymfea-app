-- =========================================================================
-- Portail client : une vue unique sur tous les établissements fréquentés
-- =========================================================================
-- Le cloisonnement posé par 20260911100000 protège le *personnel* : une
-- organisation ne voit pas les clients d'une autre. Il ne s'applique pas au
-- client vis-à-vis de ses propres données.
--
-- Un client qui fréquente deux organisations y possède deux fiches (elles
-- portent la même identité, c'est bien la même personne), reliées par son
-- compte de connexion. Dans son espace « mon compte », il doit voir
-- l'ensemble de ses réservations et de ses cartes cadeaux, quel que soit
-- l'établissement : c'est son historique, pas celui d'une organisation.
--
-- `get_customer_portal_data` agrège donc toutes les fiches rattachées au
-- compte connecté. Aucune donnée ne fuit d'une organisation vers l'autre :
-- seul le client concerné accède à ses propres lignes, et le personnel reste
-- cloisonné par la RLS de `customers`.
--
-- `_hotel_id` ne filtre plus l'historique ; il ne sert qu'à choisir la fiche
-- dont l'identité est renvoyée (préremplissage du formulaire sur le site de
-- l'établissement consulté).
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_customer_portal_data(_hotel_id text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _auth_user_id UUID;
  _organization_id UUID;
  _customer customers%ROWTYPE;
  _customer_ids UUID[];
  _gift_cards JSON;
  _upcoming_bookings JSON;
  _past_bookings JSON;
  _result JSON;
BEGIN
  _auth_user_id := auth.uid();

  IF _auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Toutes les fiches de ce client, toutes organisations confondues.
  SELECT array_agg(id) INTO _customer_ids
  FROM customers
  WHERE auth_user_id = _auth_user_id;

  IF _customer_ids IS NULL OR array_length(_customer_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Customer profile not found';
  END IF;

  -- Identité affichée : celle de l'établissement consulté quand il est connu,
  -- sinon la fiche la plus récemment mise à jour. Les fiches d'un même client
  -- portent la même identité — ce choix ne joue que sur les écarts de saisie.
  _organization_id := public.get_hotel_org_id(_hotel_id);

  IF _organization_id IS NOT NULL THEN
    SELECT * INTO _customer
    FROM customers
    WHERE auth_user_id = _auth_user_id
      AND organization_id = _organization_id
    LIMIT 1;
  END IF;

  IF _customer.id IS NULL THEN
    SELECT * INTO _customer
    FROM customers
    WHERE auth_user_id = _auth_user_id
    ORDER BY updated_at DESC
    LIMIT 1;
  END IF;

  -- Cartes cadeaux et cures dont il est bénéficiaire, tous établissements
  -- confondus.
  SELECT COALESCE(json_agg(gc ORDER BY gc.created_at DESC), '[]'::JSON)
  INTO _gift_cards
  FROM (
    SELECT
      ctb.id,
      ctb.bundle_id,
      tb.name AS bundle_name,
      tb.name_en AS bundle_name_en,
      tb.bundle_type,
      tb.cover_image_url,
      ctb.total_sessions,
      ctb.used_sessions,
      ctb.total_amount_cents,
      ctb.used_amount_cents,
      ctb.status,
      ctb.expires_at,
      ctb.is_gift,
      ctb.sender_name,
      ctb.gift_message,
      ctb.claimed_at,
      ctb.created_at,
      ctb.hotel_id,
      h.name AS hotel_name,
      h.slug AS hotel_slug
    FROM customer_treatment_bundles ctb
    JOIN treatment_bundles tb ON tb.id = ctb.bundle_id
    LEFT JOIN hotels h ON h.id = ctb.hotel_id
    WHERE ctb.beneficiary_customer_id = ANY(_customer_ids)
  ) gc;

  -- Réservations à venir, tous établissements confondus.
  SELECT COALESCE(json_agg(ub ORDER BY ub.booking_date ASC, ub.booking_time ASC), '[]'::JSON)
  INTO _upcoming_bookings
  FROM (
    SELECT
      b.id,
      b.booking_date,
      b.booking_time,
      b.status,
      b.total_price,
      b.duration,
      b.hotel_id,
      h.name AS hotel_name,
      h.slug AS hotel_slug,
      (
        SELECT json_agg(json_build_object('name', tm.name, 'name_en', tm.name_en))
        FROM booking_treatments bt
        JOIN treatment_menus tm ON tm.id = bt.treatment_id
        WHERE bt.booking_id = b.id
      ) AS treatments
    FROM bookings b
    LEFT JOIN hotels h ON h.id = b.hotel_id
    WHERE b.customer_id = ANY(_customer_ids)
      AND b.booking_date >= CURRENT_DATE
      AND b.status NOT IN ('cancelled', 'no_show')
    ORDER BY b.booking_date ASC, b.booking_time ASC
    LIMIT 20
  ) ub;

  -- Réservations passées, tous établissements confondus.
  SELECT COALESCE(json_agg(pb ORDER BY pb.booking_date DESC), '[]'::JSON)
  INTO _past_bookings
  FROM (
    SELECT
      b.id,
      b.booking_date,
      b.booking_time,
      b.status,
      b.total_price,
      b.duration,
      b.hotel_id,
      h.name AS hotel_name,
      h.slug AS hotel_slug,
      (
        SELECT json_agg(json_build_object('name', tm.name, 'name_en', tm.name_en))
        FROM booking_treatments bt
        JOIN treatment_menus tm ON tm.id = bt.treatment_id
        WHERE bt.booking_id = b.id
      ) AS treatments
    FROM bookings b
    LEFT JOIN hotels h ON h.id = b.hotel_id
    WHERE b.customer_id = ANY(_customer_ids)
      AND b.booking_date < CURRENT_DATE
    ORDER BY b.booking_date DESC
    LIMIT 50
  ) pb;

  _result := json_build_object(
    'customer', json_build_object(
      'id', _customer.id,
      'first_name', _customer.first_name,
      'last_name', _customer.last_name,
      'email', _customer.email,
      'phone', _customer.phone
    ),
    'gift_cards', _gift_cards,
    'upcoming_bookings', _upcoming_bookings,
    'past_bookings', _past_bookings
  );

  RETURN _result;
END;
$$;

COMMENT ON FUNCTION public.get_customer_portal_data(text) IS
  'Espace « mon compte » du client : identité de l''établissement consulté, et historique complet (réservations, cures, cartes cadeaux) sur tous les établissements où il a réservé.';

GRANT EXECUTE ON FUNCTION public.get_customer_portal_data(text) TO authenticated, service_role;
