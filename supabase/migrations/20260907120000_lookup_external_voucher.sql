-- =========================================================================
-- lookup_external_voucher — saisie d'un bon revendeur dans le parcours client
-- =========================================================================
-- Jusqu'ici un bon Wonderbox / Smartbox n'existait que côté backoffice : le
-- client devait appeler le lieu pour qu'une réservation soit créée à sa place.
-- Cette RPC ouvre la saisie du code à l'étape Paiement du site de réservation.
--
-- Le bon vit dans `customer_treatment_bundles` (origin = 'external'), donc une
-- fois résolu il est appliqué par le pipeline `gift_amount` déjà en place :
-- `use_gift_amount`, l'audit `bundle_amount_usages`, la restitution du solde à
-- l'annulation. Rien à ajouter côté consommation.
--
-- Le code est le secret : le détenir suffit à voir le solde. La fonction ne
-- renvoie donc que ce qui sert à décider (solde, expiration, revendeur) et
-- jamais le destinataire ni les notes internes du lieu.
--
-- NOTE : migration écrite à la main, comme 20260904100000. `supabase db diff`
-- n'est pas utilisable tant que `supabase/schemas/` est resté pré-multi-tenant.
-- =========================================================================

DROP FUNCTION IF EXISTS public.lookup_external_voucher(text, text, text);

CREATE OR REPLACE FUNCTION public.lookup_external_voucher(
  _hotel_id text,
  _code text,
  _attempt_key text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _normalized text;
  _attempts integer;
  _ctb customer_treatment_bundles%ROWTYPE;
  _reseller_name text;
  _remaining integer;
BEGIN
  -- Même normalisation que `normalizeVoucherCode` côté TypeScript : un bon
  -- enregistré par le lieu avec des tirets doit être retrouvé sans.
  _normalized := upper(regexp_replace(coalesce(_code, ''), '[^A-Za-z0-9]', '', 'g'));

  IF length(_normalized) < 4 THEN
    RAISE EXCEPTION 'Invalid code format';
  END IF;
  IF _attempt_key IS NULL OR length(_attempt_key) < 3 THEN
    RAISE EXCEPTION 'Missing attempt key';
  END IF;

  -- Même garde-fou anti-énumération que lookup_gift_card_by_code, et la même
  -- file d'audit : 10 recherches par clé et par tranche de 5 minutes.
  SELECT COUNT(*) INTO _attempts
  FROM gift_code_attempts
  WHERE attempt_key = _attempt_key
    AND created_at > now() - interval '5 minutes';

  IF _attempts >= 10 THEN
    RAISE EXCEPTION 'Too many attempts, please retry later';
  END IF;

  INSERT INTO gift_code_attempts (attempt_key, succeeded) VALUES (_attempt_key, false);

  -- Un bon est rattaché à un lieu : le code d'un autre établissement reste
  -- introuvable ici, l'index unique porte d'ailleurs sur (hotel_id, code).
  SELECT * INTO _ctb
  FROM customer_treatment_bundles
  WHERE hotel_id = _hotel_id
    AND origin = 'external'
    AND external_code_normalized = _normalized
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('found', false, 'reason', 'not_found');
  END IF;

  UPDATE gift_code_attempts
  SET succeeded = true
  WHERE id = (
    SELECT id FROM gift_code_attempts
    WHERE attempt_key = _attempt_key
    ORDER BY created_at DESC
    LIMIT 1
  );

  -- Les motifs sont distincts de 'not_found' : un bon expiré ou déjà consommé
  -- appelle un message précis, sinon le client croit avoir mal saisi son code.
  IF _ctb.expires_at < CURRENT_DATE THEN
    RETURN json_build_object('found', false, 'reason', 'expired',
                             'expires_at', _ctb.expires_at);
  END IF;
  IF _ctb.status <> 'active' THEN
    RETURN json_build_object('found', false, 'reason', 'depleted');
  END IF;

  _remaining := coalesce(_ctb.total_amount_cents, 0) - coalesce(_ctb.used_amount_cents, 0);
  IF _remaining <= 0 THEN
    RETURN json_build_object('found', false, 'reason', 'depleted');
  END IF;

  SELECT name INTO _reseller_name
  FROM voucher_resellers
  WHERE id = _ctb.reseller_id;

  RETURN json_build_object(
    'found', true,
    'customer_bundle_id', _ctb.id,
    'reseller_name', _reseller_name,
    'remaining_amount_cents', _remaining,
    'expires_at', _ctb.expires_at
  );
END;
$$;

COMMENT ON FUNCTION public.lookup_external_voucher(text, text, text) IS
  'Résout un bon revendeur par son code pour le parcours client. Ne renvoie que solde, expiration et revendeur.';

ALTER FUNCTION public.lookup_external_voucher(text, text, text) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.lookup_external_voucher(text, text, text)
  TO anon, authenticated, service_role;
