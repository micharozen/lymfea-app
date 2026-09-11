-- =========================================================================
-- Cloisonnement des RPC clients restantes
-- =========================================================================
-- Suite de 20260911100000 : `customers` est désormais cloisonnée par
-- organisation, mais six fonctions cherchaient encore une fiche client sans
-- périmètre — par téléphone, par email, ou par compte de connexion. Tant
-- qu'une seule organisation exploitait des lieux, cela ne se voyait pas ;
-- dès la deuxième, chacune devient soit une fuite, soit un résultat tiré au
-- hasard entre deux fiches homonymes.
--
-- Règle appliquée partout : l'organisation vient du lieu concerné (la
-- réservation en cours, ou le lieu du bundle), et toute recherche de fiche y
-- est confinée.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Résolution d'une fiche client dans le périmètre d'un lieu
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.find_customer_in_hotel_org(
  _phone text,
  _hotel_id text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id
  FROM public.customers c
  WHERE c.organization_id = public.get_hotel_org_id(_hotel_id)
    AND c.phone IS NOT NULL
    AND regexp_replace(trim(c.phone), '[\s\-\.]', '', 'g')
        = regexp_replace(trim(_phone), '[\s\-\.]', '', 'g')
  LIMIT 1
$$;

COMMENT ON FUNCTION public.find_customer_in_hotel_org(text, text) IS
  'Fiche client correspondant à ce téléphone dans l''organisation du lieu. Deux organisations peuvent connaître le même numéro : ce sont deux clients distincts.';

GRANT EXECUTE ON FUNCTION public.find_customer_in_hotel_org(text, text)
  TO anon, authenticated, service_role;

-- Fiche du client connecté dans l'organisation d'un lieu donné. Un compte de
-- connexion peut porter une fiche par organisation.
CREATE OR REPLACE FUNCTION public.find_auth_customer_in_hotel_org(_hotel_id text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id
  FROM public.customers c
  WHERE c.auth_user_id = auth.uid()
    AND c.organization_id = public.get_hotel_org_id(_hotel_id)
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.find_auth_customer_in_hotel_org(text)
  TO authenticated, service_role;

-- -------------------------------------------------------------------------
-- 2. detect_bundles_for_booking — cures détectées au moment de réserver
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.detect_bundles_for_booking(
  _phone text,
  _hotel_id text,
  _treatment_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS TABLE(
  customer_bundle_id uuid,
  bundle_name text,
  bundle_name_en text,
  total_sessions integer,
  used_sessions integer,
  remaining_sessions integer,
  expires_at date,
  eligible_treatment_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _customer_id UUID;
BEGIN
  -- La fiche est cherchée dans la seule organisation du lieu réservé.
  _customer_id := public.find_customer_in_hotel_org(_phone, _hotel_id);

  IF _customer_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ctb.id AS customer_bundle_id,
    tb.name AS bundle_name,
    tb.name_en AS bundle_name_en,
    ctb.total_sessions,
    ctb.used_sessions,
    (ctb.total_sessions - ctb.used_sessions) AS remaining_sessions,
    ctb.expires_at,
    array_agg(DISTINCT tbi.treatment_id) AS eligible_treatment_ids
  FROM customer_treatment_bundles ctb
  JOIN treatment_bundles tb ON tb.id = ctb.bundle_id
  JOIN treatment_bundle_items tbi ON tbi.bundle_id = tb.id
  WHERE ctb.beneficiary_customer_id = _customer_id
    AND ctb.hotel_id = _hotel_id
    AND ctb.status = 'active'
    AND tb.bundle_type IN ('cure', 'gift_treatments')
    AND ctb.expires_at >= CURRENT_DATE
    AND ctb.total_sessions IS NOT NULL
    AND ctb.used_sessions < ctb.total_sessions
    AND (
      _treatment_ids IS NULL
      OR tbi.treatment_id = ANY(_treatment_ids)
    )
  GROUP BY ctb.id, tb.name, tb.name_en, ctb.total_sessions, ctb.used_sessions, ctb.expires_at
  HAVING (
    _treatment_ids IS NULL
    OR bool_or(tbi.treatment_id = ANY(_treatment_ids))
  );
END;
$$;

-- -------------------------------------------------------------------------
-- 3. detect_gift_cards_for_booking — cartes cadeaux à montant
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.detect_gift_cards_for_booking(
  _phone text,
  _hotel_id text
)
RETURNS TABLE(
  customer_bundle_id uuid,
  title text,
  title_en text,
  cover_image_url text,
  total_amount_cents integer,
  used_amount_cents integer,
  remaining_amount_cents integer,
  expires_at date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _customer_id UUID;
BEGIN
  _customer_id := public.find_customer_in_hotel_org(_phone, _hotel_id);

  IF _customer_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ctb.id,
    tb.title,
    tb.title_en,
    tb.cover_image_url,
    ctb.total_amount_cents,
    ctb.used_amount_cents,
    (ctb.total_amount_cents - ctb.used_amount_cents) AS remaining_amount_cents,
    ctb.expires_at
  FROM customer_treatment_bundles ctb
  JOIN treatment_bundles tb ON tb.id = ctb.bundle_id
  WHERE ctb.beneficiary_customer_id = _customer_id
    AND ctb.hotel_id = _hotel_id
    AND ctb.status = 'active'
    AND tb.bundle_type = 'gift_amount'
    AND ctb.expires_at >= CURRENT_DATE
    AND ctb.total_amount_cents IS NOT NULL
    AND ctb.used_amount_cents < ctb.total_amount_cents;
END;
$$;

-- -------------------------------------------------------------------------
-- 4. detect_bundles_for_auth_customer — client connecté en cours de réservation
-- -------------------------------------------------------------------------
-- Un compte de connexion peut porter une fiche par organisation : sans
-- périmètre, le LIMIT 1 pouvait renvoyer la fiche d'une autre organisation et
-- donc les cures d'un autre établissement.

CREATE OR REPLACE FUNCTION public.detect_bundles_for_auth_customer(
  _hotel_id text,
  _treatment_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _customer_id UUID;
  _session_bundles JSON;
  _amount_bundles JSON;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  _customer_id := public.find_auth_customer_in_hotel_org(_hotel_id);

  IF _customer_id IS NULL THEN
    RETURN json_build_object('session_bundles', '[]'::JSON, 'amount_bundles', '[]'::JSON);
  END IF;

  -- Session bundles (cure + gift_treatments)
  SELECT COALESCE(json_agg(row_to_json(sb)), '[]'::JSON)
  INTO _session_bundles
  FROM (
    SELECT
      ctb.id AS customer_bundle_id,
      tb.name AS bundle_name,
      tb.name_en AS bundle_name_en,
      tb.bundle_type,
      ctb.total_sessions,
      ctb.used_sessions,
      (ctb.total_sessions - ctb.used_sessions) AS remaining_sessions,
      ctb.expires_at,
      array_agg(DISTINCT tbi.treatment_id) AS eligible_treatment_ids
    FROM customer_treatment_bundles ctb
    JOIN treatment_bundles tb ON tb.id = ctb.bundle_id
    JOIN treatment_bundle_items tbi ON tbi.bundle_id = tb.id
    WHERE ctb.beneficiary_customer_id = _customer_id
      AND ctb.hotel_id = _hotel_id
      AND ctb.status = 'active'
      AND tb.bundle_type IN ('cure', 'gift_treatments')
      AND ctb.expires_at >= CURRENT_DATE
      AND ctb.total_sessions IS NOT NULL
      AND ctb.used_sessions < ctb.total_sessions
      AND (
        _treatment_ids IS NULL
        OR tbi.treatment_id = ANY(_treatment_ids)
      )
    GROUP BY ctb.id, tb.name, tb.name_en, tb.bundle_type, ctb.total_sessions, ctb.used_sessions, ctb.expires_at
    HAVING (
      _treatment_ids IS NULL
      OR bool_or(tbi.treatment_id = ANY(_treatment_ids))
    )
  ) sb;

  -- Amount bundles (gift_amount)
  SELECT COALESCE(json_agg(row_to_json(ab)), '[]'::JSON)
  INTO _amount_bundles
  FROM (
    SELECT
      ctb.id AS customer_bundle_id,
      tb.name AS bundle_name,
      tb.name_en AS bundle_name_en,
      tb.cover_image_url,
      ctb.total_amount_cents,
      ctb.used_amount_cents,
      (ctb.total_amount_cents - ctb.used_amount_cents) AS remaining_amount_cents,
      ctb.expires_at
    FROM customer_treatment_bundles ctb
    JOIN treatment_bundles tb ON tb.id = ctb.bundle_id
    WHERE ctb.beneficiary_customer_id = _customer_id
      AND ctb.hotel_id = _hotel_id
      AND ctb.status = 'active'
      AND tb.bundle_type = 'gift_amount'
      AND ctb.expires_at >= CURRENT_DATE
      AND ctb.total_amount_cents IS NOT NULL
      AND ctb.used_amount_cents < ctb.total_amount_cents
  ) ab;

  RETURN json_build_object(
    'session_bundles', _session_bundles,
    'amount_bundles', _amount_bundles
  );
END;
$$;

-- -------------------------------------------------------------------------
-- 5. claim_gift_card — réclamation par un client connecté
-- -------------------------------------------------------------------------
-- L'organisation vient du lieu du bundle : le bénéficiaire désigné est la
-- fiche du client dans CETTE organisation, créée au besoin.

CREATE OR REPLACE FUNCTION public.claim_gift_card(_code text, _email text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid UUID;
  _customer_id UUID;
  _organization_id UUID;
  _ctb customer_treatment_bundles%ROWTYPE;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  _code := upper(regexp_replace(coalesce(_code, ''), '\s', '', 'g'));

  SELECT * INTO _ctb
  FROM customer_treatment_bundles
  WHERE redemption_code = _code AND is_gift = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gift code not found';
  END IF;
  IF _ctb.claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Gift code already claimed';
  END IF;
  IF _ctb.expires_at < CURRENT_DATE THEN
    RAISE EXCEPTION 'Gift card has expired';
  END IF;

  _organization_id := public.get_hotel_org_id(_ctb.hotel_id);
  IF _organization_id IS NULL THEN
    RAISE EXCEPTION 'Gift card venue has no organization';
  END IF;

  -- Fiche du client dans l'organisation de la carte cadeau, créée au besoin.
  SELECT id INTO _customer_id
  FROM customers
  WHERE auth_user_id = _uid
    AND organization_id = _organization_id
  LIMIT 1;

  IF _customer_id IS NULL THEN
    INSERT INTO customers (organization_id, auth_user_id, email, profile_completed)
    VALUES (_organization_id, _uid, _email, false)
    RETURNING id INTO _customer_id;
  END IF;

  UPDATE customer_treatment_bundles
  SET beneficiary_customer_id = _customer_id,
      claimed_at = now(),
      updated_at = now()
  WHERE id = _ctb.id;

  RETURN _ctb.id;
END;
$$;

-- -------------------------------------------------------------------------
-- 6. claim_gift_card_public — réclamation sans compte
-- -------------------------------------------------------------------------
-- Exposée à `anon` : la recherche par email était globale, donc un email connu
-- d'une autre organisation faisait mouche. Elle est confinée à l'organisation
-- du lieu de la carte.

CREATE OR REPLACE FUNCTION public.claim_gift_card_public(
  _code text,
  _email text,
  _first_name text DEFAULT NULL::text
)
RETURNS TABLE(bundle_id uuid, hotel_id text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _ctb customer_treatment_bundles%ROWTYPE;
  _customer_id UUID;
  _organization_id UUID;
BEGIN
  _code := upper(regexp_replace(coalesce(_code, ''), '\s', '', 'g'));

  IF _email IS NULL OR length(trim(_email)) < 5 THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  SELECT * INTO _ctb
  FROM customer_treatment_bundles
  WHERE redemption_code = _code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gift code not found';
  END IF;
  IF _ctb.claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Gift code already claimed';
  END IF;
  IF _ctb.expires_at < CURRENT_DATE THEN
    RAISE EXCEPTION 'Gift card has expired';
  END IF;

  _organization_id := public.get_hotel_org_id(_ctb.hotel_id);
  IF _organization_id IS NULL THEN
    RAISE EXCEPTION 'Gift card venue has no organization';
  END IF;

  SELECT id INTO _customer_id
  FROM customers
  WHERE organization_id = _organization_id
    AND lower(email) = lower(trim(_email))
  LIMIT 1;

  IF _customer_id IS NULL THEN
    INSERT INTO customers (organization_id, email, first_name, profile_completed)
    VALUES (_organization_id, lower(trim(_email)), _first_name, false)
    RETURNING id INTO _customer_id;
  END IF;

  UPDATE customer_treatment_bundles
  SET beneficiary_customer_id = _customer_id,
      claimed_at = now(),
      updated_at = now()
  WHERE id = _ctb.id;

  RETURN QUERY
  SELECT _ctb.id, _ctb.hotel_id, 'claimed'::TEXT;
END;
$$;

-- -------------------------------------------------------------------------
-- 7. merge_customer_profiles — fusion de doublons
-- -------------------------------------------------------------------------
-- La fusion déplace cures et réservations puis supprime la fiche source :
-- appliquée à deux organisations, elle transférait des réservations de l'une à
-- l'autre. Deux fiches de deux organisations ne sont pas des doublons, ce sont
-- deux clients distincts — la fusion est refusée.

CREATE OR REPLACE FUNCTION public.merge_customer_profiles(
  _new_customer_id uuid,
  _existing_customer_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid UUID;
  _new_auth UUID;
  _existing_auth UUID;
  _new_org UUID;
  _existing_org UUID;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT auth_user_id, organization_id INTO _new_auth, _new_org
  FROM customers WHERE id = _new_customer_id;
  IF _new_auth IS NULL OR _new_auth <> _uid THEN
    RAISE EXCEPTION 'Unauthorized merge';
  END IF;

  SELECT auth_user_id, organization_id INTO _existing_auth, _existing_org
  FROM customers WHERE id = _existing_customer_id;
  IF _existing_auth IS NOT NULL AND _existing_auth <> _uid THEN
    RAISE EXCEPTION 'Target profile is already linked to a different account';
  END IF;

  IF _new_org IS DISTINCT FROM _existing_org THEN
    RAISE EXCEPTION 'Impossible de fusionner deux fiches de deux organisations différentes.';
  END IF;

  UPDATE customer_treatment_bundles
  SET customer_id = _existing_customer_id
  WHERE customer_id = _new_customer_id;

  UPDATE customer_treatment_bundles
  SET beneficiary_customer_id = _existing_customer_id
  WHERE beneficiary_customer_id = _new_customer_id;

  UPDATE bookings
  SET customer_id = _existing_customer_id
  WHERE customer_id = _new_customer_id;

  UPDATE customers
  SET auth_user_id = _uid,
      profile_completed = true,
      updated_at = now()
  WHERE id = _existing_customer_id;

  DELETE FROM customers WHERE id = _new_customer_id;
END;
$$;

-- -------------------------------------------------------------------------
-- 8. get_customer_portal_data — écran « mon compte » du portail client
-- -------------------------------------------------------------------------
-- Un compte de connexion pouvant porter une fiche par organisation, la
-- fonction doit savoir de laquelle il s'agit. Elle prend donc le lieu
-- consulté ; sans lui, elle n'accepte que le cas non ambigu (une seule fiche
-- pour ce compte) et refuse explicitement plutôt que d'en tirer une au hasard.
--
-- L'ancienne signature sans argument est supprimée : la laisser cohabiter
-- rendrait l'appel `get_customer_portal_data()` ambigu.

DROP FUNCTION IF EXISTS public.get_customer_portal_data();

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
  _profile_count INTEGER;
  _gift_cards JSON;
  _upcoming_bookings JSON;
  _past_bookings JSON;
  _result JSON;
BEGIN
  _auth_user_id := auth.uid();

  IF _auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  _organization_id := public.get_hotel_org_id(_hotel_id);

  IF _organization_id IS NOT NULL THEN
    SELECT * INTO _customer
    FROM customers
    WHERE auth_user_id = _auth_user_id
      AND organization_id = _organization_id
    LIMIT 1;
  ELSE
    SELECT count(*) INTO _profile_count
    FROM customers
    WHERE auth_user_id = _auth_user_id;

    IF _profile_count > 1 THEN
      RAISE EXCEPTION 'Ce compte possède une fiche dans plusieurs organisations : précisez le lieu consulté (_hotel_id).';
    END IF;

    SELECT * INTO _customer
    FROM customers
    WHERE auth_user_id = _auth_user_id
    LIMIT 1;
  END IF;

  IF _customer.id IS NULL THEN
    RAISE EXCEPTION 'Customer profile not found';
  END IF;

  -- Gift cards / bundles where this customer is the beneficiary
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
    WHERE ctb.beneficiary_customer_id = _customer.id
  ) gc;

  -- Upcoming bookings (today or future)
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
    WHERE b.customer_id = _customer.id
      AND b.booking_date >= CURRENT_DATE
      AND b.status NOT IN ('cancelled', 'no_show')
    LIMIT 20
  ) ub;

  -- Past bookings
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
    WHERE b.customer_id = _customer.id
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

GRANT EXECUTE ON FUNCTION public.get_customer_portal_data(text) TO authenticated, service_role;
