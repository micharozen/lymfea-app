-- =========================================================================
-- Codes promo — remise sur les soins réservés par le client final
-- =========================================================================
-- Un code promo remise le panier du tunnel de réservation publique. Il porte
-- une assiette : la liste des soins auxquels la remise s'applique (« -20% sur
-- les massages »). Assiette vide = tout le panier.
--
-- Périmètre volontairement distinct des avoirs (`customer_treatment_bundles`) :
-- un avoir est un montant prépayé qui se consomme, un code promo est une règle
-- de calcul réutilisable. Les deux se cumulent — la remise s'applique d'abord,
-- l'avoir couvre ensuite le reste.
--
-- Invariant de prix : une remise baisse le prix de vente, à la différence d'un
-- avoir qui est un paiement partiel. `bookings.total_price` porte donc le
-- montant réellement dû — celui qui alimente le chiffre d'affaires, les
-- factures et la note de chambre — et `promo_discount_cents` garde la trace de
-- la remise, le brut restant calculable par addition.
--
-- NOTE : migration écrite à la main, comme 20260904100000 et 20260907170000.
-- `supabase db diff` n'est pas utilisable ici (`supabase/schemas/` est resté
-- pré-multi-tenant et le diff supprimerait cette couche).
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. promo_codes — catalogue des codes, partagé par organisation
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.promo_codes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  hotel_id text REFERENCES public.hotels(id) ON DELETE CASCADE,
  code text NOT NULL,
  code_normalized text NOT NULL,
  discount_type text NOT NULL,
  discount_value numeric(10,2) NOT NULL,
  valid_from timestamptz,
  valid_until timestamptz,
  max_redemptions integer,
  max_per_customer integer,
  redemption_count integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  description text,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT chk_promo_discount_type
    CHECK (discount_type IN ('percentage', 'fixed_amount')),
  CONSTRAINT chk_promo_discount_value
    CHECK (discount_value > 0 AND (discount_type <> 'percentage' OR discount_value <= 100)),
  CONSTRAINT chk_promo_max_redemptions
    CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  CONSTRAINT chk_promo_max_per_customer
    CHECK (max_per_customer IS NULL OR max_per_customer > 0),
  CONSTRAINT chk_promo_validity_window
    CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_until >= valid_from)
);

COMMENT ON TABLE public.promo_codes IS
  'Codes promo appliqués au panier du tunnel de réservation client. Sans lien avec la facturation des abonnements SaaS.';
COMMENT ON COLUMN public.promo_codes.hotel_id IS
  'NULL = code valable sur tous les lieux de l''organisation. Sinon, restreint à ce lieu.';
COMMENT ON COLUMN public.promo_codes.code_normalized IS
  'upper(code) sans séparateurs — un code saisi « ETE-20 » doit être retrouvé en « ete20 ». Même normalisation que normalizeVoucherCode côté TypeScript.';
COMMENT ON COLUMN public.promo_codes.discount_value IS
  'Pourcentage (1-100) si discount_type = percentage, sinon montant en unités de devise.';
COMMENT ON COLUMN public.promo_codes.max_per_customer IS
  'Utilisations autorisées par client (NULL = illimité). Le client du tunnel public n''ayant pas de compte, il est reconnu par son téléphone ou son email via la table customers.';
COMMENT ON COLUMN public.promo_codes.redemption_count IS
  'Compteur dénormalisé, incrémenté atomiquement par redeem_promo_code. Source de vérité du plafond max_redemptions.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_promo_codes_org_code
  ON public.promo_codes (organization_id, code_normalized);
CREATE INDEX IF NOT EXISTS idx_promo_codes_org
  ON public.promo_codes (organization_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_hotel
  ON public.promo_codes (hotel_id) WHERE hotel_id IS NOT NULL;

-- -------------------------------------------------------------------------
-- 2. promo_code_treatments — assiette de la remise
-- -------------------------------------------------------------------------
-- Vrai many-to-many (« -20% sur les massages » vise N soins), d'où la table de
-- jonction plutôt qu'une colonne uuid[] : elle apporte la FK et le CASCADE, et
-- le projet migre justement skills[] vers therapist_treatments.

CREATE TABLE IF NOT EXISTS public.promo_code_treatments (
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  treatment_id uuid NOT NULL REFERENCES public.treatment_menus(id) ON DELETE CASCADE,
  PRIMARY KEY (promo_code_id, treatment_id)
);

COMMENT ON TABLE public.promo_code_treatments IS
  'Soins auxquels la remise s''applique. Aucune ligne pour un code = tout le panier est éligible.';

CREATE INDEX IF NOT EXISTS idx_promo_code_treatments_treatment
  ON public.promo_code_treatments (treatment_id);

-- -------------------------------------------------------------------------
-- 3. promo_code_redemptions — audit des utilisations
-- -------------------------------------------------------------------------
-- Calqué sur bundle_amount_usages. L'unicité (booking_id, promo_code_id) rend
-- redeem_promo_code idempotent : un retry d'edge function ne consomme pas deux
-- fois le code.

CREATE TABLE IF NOT EXISTS public.promo_code_redemptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  hotel_id text,
  discount_amount_cents integer NOT NULL,
  redeemed_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT chk_promo_redemption_amount CHECK (discount_amount_cents >= 0),
  CONSTRAINT uq_promo_redemption_booking UNIQUE (booking_id, promo_code_id)
);

COMMENT ON TABLE public.promo_code_redemptions IS
  'Une ligne par réservation ayant consommé un code promo. Source des métriques du backoffice.';

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_code
  ON public.promo_code_redemptions (promo_code_id, redeemed_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_customer
  ON public.promo_code_redemptions (promo_code_id, customer_id)
  WHERE customer_id IS NOT NULL;

-- -------------------------------------------------------------------------
-- 4. bookings — remise appliquée
-- -------------------------------------------------------------------------

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS promo_code_id uuid REFERENCES public.promo_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promo_discount_cents integer DEFAULT 0 NOT NULL;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS chk_bookings_promo_discount;
ALTER TABLE public.bookings
  ADD CONSTRAINT chk_bookings_promo_discount CHECK (promo_discount_cents >= 0) NOT VALID;
ALTER TABLE public.bookings VALIDATE CONSTRAINT chk_bookings_promo_discount;

COMMENT ON COLUMN public.bookings.promo_discount_cents IS
  'Remise accordée par le code promo, en centimes. Contrairement à gift_amount_applied_cents (un avoir est un paiement partiel, le lieu encaisse le plein tarif), une remise baisse le prix de vente : total_price porte donc le montant réellement dû, et le brut se recalcule par total_price + promo_discount_cents/100.';

CREATE INDEX IF NOT EXISTS idx_bookings_promo_code
  ON public.bookings (promo_code_id) WHERE promo_code_id IS NOT NULL;

-- -------------------------------------------------------------------------
-- 5. RLS
-- -------------------------------------------------------------------------
-- Prédicats hoistables uniquement (aucune fonction prenant l'id de la ligne) —
-- cf. 20260915100000 et 20260915140000, où ce motif provoquait un timeout.

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Block anonymous access to promo codes" ON public.promo_codes
  AS RESTRICTIVE TO anon USING (false);

CREATE POLICY "Admins can manage promo codes" ON public.promo_codes
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND (
      public.is_super_admin(auth.uid())
      OR organization_id = public.get_user_org_id(auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND (
      public.is_super_admin(auth.uid())
      OR organization_id = public.get_user_org_id(auth.uid())
    )
  );

CREATE POLICY "Concierges can view promo codes" ON public.promo_codes
  FOR SELECT USING (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND organization_id = public.get_user_org_id(auth.uid())
  );

GRANT ALL ON TABLE public.promo_codes TO anon, authenticated, service_role;

ALTER TABLE public.promo_code_treatments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Block anonymous access to promo code treatments" ON public.promo_code_treatments
  AS RESTRICTIVE TO anon USING (false);

CREATE POLICY "Admins can manage promo code treatments" ON public.promo_code_treatments
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Concierges can view promo code treatments" ON public.promo_code_treatments
  FOR SELECT USING (public.has_role(auth.uid(), 'concierge'::public.app_role));

GRANT ALL ON TABLE public.promo_code_treatments TO anon, authenticated, service_role;

ALTER TABLE public.promo_code_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Block anonymous access to promo code redemptions" ON public.promo_code_redemptions
  AS RESTRICTIVE TO anon USING (false);

CREATE POLICY "Admins can view promo code redemptions" ON public.promo_code_redemptions
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Concierges can view promo code redemptions" ON public.promo_code_redemptions
  FOR SELECT USING (public.has_role(auth.uid(), 'concierge'::public.app_role));

GRANT ALL ON TABLE public.promo_code_redemptions TO anon, authenticated, service_role;

-- -------------------------------------------------------------------------
-- 6. promo_customer_usage_count — utilisations déjà faites par un client
-- -------------------------------------------------------------------------
-- Le tunnel client est public : il n'y a pas de compte sur lequel s'appuyer.
-- Un client est donc reconnu par son téléphone OU son email, les deux clés que
-- porte `customers`. Le téléphone est unique par organisation ; l'email ne
-- l'est pas, d'où le rattachement à plusieurs fiches possibles — on les compte
-- toutes, ce qui est le comportement voulu (le plus strict).

CREATE OR REPLACE FUNCTION public.promo_customer_usage_count(
  _promo_code_id uuid,
  _org_id uuid,
  _phone text,
  _email text
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM promo_code_redemptions r
  WHERE r.promo_code_id = _promo_code_id
    AND r.customer_id IN (
      SELECT c.id FROM customers c
      WHERE c.organization_id = _org_id
        AND (
          (nullif(_phone, '') IS NOT NULL AND c.phone = _phone)
          OR (nullif(_email, '') IS NOT NULL AND lower(c.email) = lower(_email))
        )
    );
$$;

COMMENT ON FUNCTION public.promo_customer_usage_count(uuid, uuid, text, text) IS
  'Nombre de fois qu''un client (reconnu par téléphone ou email) a déjà consommé un code promo. Sert au plafond max_per_customer.';

GRANT EXECUTE ON FUNCTION public.promo_customer_usage_count(uuid, uuid, text, text) TO anon, authenticated, service_role;

-- -------------------------------------------------------------------------
-- 7. lookup_promo_code — validation publique du code saisi par le client
-- -------------------------------------------------------------------------
-- Ouverte à `anon` : même garde-fou anti-énumération que
-- lookup_external_voucher, et la même file d'audit gift_code_attempts.
-- Ne renvoie jamais les compteurs ni la description : uniquement de quoi
-- calculer et afficher la remise.

CREATE OR REPLACE FUNCTION public.lookup_promo_code(
  _hotel_id text,
  _code text,
  _attempt_key text,
  _phone text DEFAULT NULL,
  _email text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _normalized text;
  _attempts integer;
  _org_id uuid;
  _promo promo_codes%ROWTYPE;
  _treatment_ids uuid[];
BEGIN
  _normalized := upper(regexp_replace(coalesce(_code, ''), '[^A-Za-z0-9]', '', 'g'));

  IF length(_normalized) < 3 THEN
    RAISE EXCEPTION 'Invalid code format';
  END IF;
  IF _attempt_key IS NULL OR length(_attempt_key) < 3 THEN
    RAISE EXCEPTION 'Missing attempt key';
  END IF;

  _org_id := public.get_hotel_org_id(_hotel_id);
  IF _org_id IS NULL THEN
    RETURN json_build_object('found', false, 'reason', 'not_found');
  END IF;

  SELECT COUNT(*) INTO _attempts
  FROM gift_code_attempts
  WHERE attempt_key = _attempt_key
    AND created_at > now() - interval '5 minutes';

  IF _attempts >= 10 THEN
    RAISE EXCEPTION 'Too many attempts, please retry later';
  END IF;

  INSERT INTO gift_code_attempts (attempt_key, succeeded) VALUES (_attempt_key, false);

  -- Un code appartient à une organisation ; hotel_id NULL le rend valable sur
  -- tous ses lieux, sinon il est restreint à celui-là.
  SELECT * INTO _promo
  FROM promo_codes
  WHERE organization_id = _org_id
    AND code_normalized = _normalized
    AND (hotel_id IS NULL OR hotel_id = _hotel_id)
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

  -- Motifs distincts de 'not_found' : un code expiré ou épuisé appelle un
  -- message précis, sinon le client croit avoir mal saisi son code.
  IF NOT _promo.is_active THEN
    RETURN json_build_object('found', false, 'reason', 'inactive');
  END IF;
  IF _promo.valid_from IS NOT NULL AND now() < _promo.valid_from THEN
    RETURN json_build_object('found', false, 'reason', 'not_yet_valid',
                             'valid_from', _promo.valid_from);
  END IF;
  IF _promo.valid_until IS NOT NULL AND now() > _promo.valid_until THEN
    RETURN json_build_object('found', false, 'reason', 'expired',
                             'valid_until', _promo.valid_until);
  END IF;
  IF _promo.max_redemptions IS NOT NULL
     AND _promo.redemption_count >= _promo.max_redemptions THEN
    RETURN json_build_object('found', false, 'reason', 'exhausted');
  END IF;

  -- Plafond par client : refusé dès la saisie, pour ne pas afficher une remise
  -- que le serveur retirera au moment d'encaisser. Le contrôle est refait à la
  -- consommation, qui seule fait foi.
  IF _promo.max_per_customer IS NOT NULL
     AND (nullif(_phone, '') IS NOT NULL OR nullif(_email, '') IS NOT NULL)
     AND public.promo_customer_usage_count(_promo.id, _org_id, _phone, _email)
         >= _promo.max_per_customer THEN
    RETURN json_build_object('found', false, 'reason', 'customer_limit_reached');
  END IF;

  -- Tableau vide = aucune restriction, tout le panier est éligible. Exposer ces
  -- ids à `anon` est sans risque : le catalogue est déjà public via
  -- get_public_treatments.
  SELECT coalesce(array_agg(treatment_id), ARRAY[]::uuid[]) INTO _treatment_ids
  FROM promo_code_treatments
  WHERE promo_code_id = _promo.id;

  RETURN json_build_object(
    'found', true,
    'id', _promo.id,
    'code', _promo.code,
    'discount_type', _promo.discount_type,
    'discount_value', _promo.discount_value,
    'eligible_treatment_ids', to_jsonb(_treatment_ids)
  );
END;
$$;

COMMENT ON FUNCTION public.lookup_promo_code(text, text, text, text, text) IS
  'Valide un code promo saisi dans le tunnel client. Rate-limitée (10 essais / 5 min par clé), ne divulgue ni les compteurs ni la description.';

GRANT EXECUTE ON FUNCTION public.lookup_promo_code(text, text, text, text, text) TO anon, authenticated, service_role;

-- -------------------------------------------------------------------------
-- 8. redeem_promo_code — consommation, appelée par les edge functions
-- -------------------------------------------------------------------------
-- Revalide intégralement : le client ne peut pas faire consommer un code
-- expiré, épuisé ou d'un autre lieu en rejouant une requête. Idempotente par
-- la contrainte d'unicité (booking_id, promo_code_id).

CREATE OR REPLACE FUNCTION public.redeem_promo_code(
  _promo_code_id uuid,
  _booking_id uuid,
  _hotel_id text,
  _customer_id uuid,
  _discount_cents integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _inserted_rows integer := 0;
  _max_per_customer integer;
  _customer_uses integer;
BEGIN
  IF _discount_cents IS NULL OR _discount_cents <= 0 THEN
    RETURN json_build_object('applied', false, 'reason', 'no_discount');
  END IF;

  _org_id := public.get_hotel_org_id(_hotel_id);

  -- Verrou sur la ligne : deux réservations concurrentes ne peuvent pas
  -- dépasser ensemble max_redemptions.
  PERFORM 1
  FROM promo_codes
  WHERE id = _promo_code_id
    AND organization_id = _org_id
    AND is_active
    AND (hotel_id IS NULL OR hotel_id = _hotel_id)
    AND (valid_from IS NULL OR now() >= valid_from)
    AND (valid_until IS NULL OR now() <= valid_until)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('applied', false, 'reason', 'invalid');
  END IF;

  -- Plafond par client, revérifié sous le verrou : deux réservations
  -- simultanées du même client ne peuvent pas le dépasser ensemble.
  IF _customer_id IS NOT NULL THEN
    SELECT max_per_customer INTO _max_per_customer FROM promo_codes WHERE id = _promo_code_id;
    IF _max_per_customer IS NOT NULL THEN
      SELECT count(*) INTO _customer_uses
      FROM promo_code_redemptions
      WHERE promo_code_id = _promo_code_id AND customer_id = _customer_id;

      IF _customer_uses >= _max_per_customer THEN
        RETURN json_build_object('applied', false, 'reason', 'customer_limit_reached');
      END IF;
    END IF;
  END IF;

  INSERT INTO promo_code_redemptions (
    promo_code_id, booking_id, customer_id, hotel_id, discount_amount_cents
  )
  VALUES (_promo_code_id, _booking_id, _customer_id, _hotel_id, _discount_cents)
  ON CONFLICT (booking_id, promo_code_id) DO NOTHING;

  GET DIAGNOSTICS _inserted_rows = ROW_COUNT;

  -- Rejeu d'une edge function : la réservation a déjà consommé ce code, on ne
  -- réincrémente pas le compteur.
  IF _inserted_rows = 0 THEN
    RETURN json_build_object('applied', true, 'reason', 'already_redeemed');
  END IF;

  UPDATE promo_codes
  SET redemption_count = redemption_count + 1,
      updated_at = now()
  WHERE id = _promo_code_id
    AND (max_redemptions IS NULL OR redemption_count < max_redemptions);

  IF NOT FOUND THEN
    -- Plafond atteint entre la validation et la consommation : on annule.
    DELETE FROM promo_code_redemptions
    WHERE booking_id = _booking_id AND promo_code_id = _promo_code_id;
    RETURN json_build_object('applied', false, 'reason', 'exhausted');
  END IF;

  UPDATE bookings
  SET promo_code_id = _promo_code_id,
      promo_discount_cents = _discount_cents
  WHERE id = _booking_id;

  RETURN json_build_object('applied', true, 'discount_cents', _discount_cents);
END;
$$;

COMMENT ON FUNCTION public.redeem_promo_code(uuid, uuid, text, uuid, integer) IS
  'Consomme un code promo pour une réservation : revalide, incrémente le compteur sous verrou et journalise l''usage. Idempotente par (booking_id, promo_code_id).';

GRANT EXECUTE ON FUNCTION public.redeem_promo_code(uuid, uuid, text, uuid, integer) TO service_role;

-- -------------------------------------------------------------------------
-- 9. get_promo_code_stats — métriques du backoffice
-- -------------------------------------------------------------------------
-- Agrégat côté serveur : lire les usages ligne à ligne pour les additionner
-- côté client buterait sur le plafond de 1000 lignes de PostgREST dès qu'un
-- code est un peu utilisé.

CREATE OR REPLACE FUNCTION public.get_promo_code_stats(_promo_code_ids uuid[])
RETURNS TABLE(
  promo_code_id uuid,
  redemptions bigint,
  total_discount_cents bigint,
  last_redeemed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.promo_code_id,
         count(*)::bigint,
         coalesce(sum(r.discount_amount_cents), 0)::bigint,
         max(r.redeemed_at)
  FROM promo_code_redemptions r
  JOIN promo_codes p ON p.id = r.promo_code_id
  WHERE r.promo_code_id = ANY(_promo_code_ids)
    -- Un appelant ne voit que les codes de son organisation ; le super-admin
    -- les voit tous.
    AND (
      public.is_super_admin(auth.uid())
      OR p.organization_id = public.get_user_org_id(auth.uid())
    )
  GROUP BY r.promo_code_id;
$$;

COMMENT ON FUNCTION public.get_promo_code_stats(uuid[]) IS
  'Compteur d''usages et total remisé par code promo, agrégés côté serveur pour le backoffice.';

GRANT EXECUTE ON FUNCTION public.get_promo_code_stats(uuid[]) TO authenticated, service_role;

-- -------------------------------------------------------------------------
-- 10. Restitution du code promo à l'annulation
-- -------------------------------------------------------------------------
-- Même traitement que les avoirs, restitués juste au-dessus dans cette même
-- fonction : une réservation annulée n'a rien consommé. Sans cela, un client
-- annulant une réservation perdait définitivement son droit sur un code limité
-- à une utilisation, et un code plafonné perdait un usage à chaque annulation.
--
-- La fonction est redéfinie en entier (CREATE OR REPLACE) : seuls le bloc
-- promo et la remise à zéro sur `bookings` sont nouveaux.

CREATE OR REPLACE FUNCTION public.begin_booking_cancellation(
  _booking_id uuid,
  _reason text,
  _cancelled_by uuid,
  _cancellation_fee_amount numeric,
  _refund_amount numeric
)
RETURNS SETOF bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _current_status TEXT;
  _gift_restored_cents INTEGER := 0;
BEGIN
  IF _cancelled_by IS NULL THEN
    PERFORM set_config('app.audit_source', 'client', true);
  END IF;

  SELECT status
  INTO _current_status
  FROM public.bookings
  WHERE id = _booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF _current_status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'booking_not_cancellable' USING ERRCODE = 'P0001';
  END IF;

  WITH usage_totals AS (
    SELECT
      customer_bundle_id,
      SUM(amount_cents_used)::INTEGER AS amount_cents
    FROM public.bundle_amount_usages
    WHERE booking_id = _booking_id
    GROUP BY customer_bundle_id
  ),
  restored_bundles AS (
    UPDATE public.customer_treatment_bundles ctb
    SET
      used_amount_cents = GREATEST(0, ctb.used_amount_cents - usage_totals.amount_cents),
      status = CASE
        WHEN ctb.status = 'completed'
          AND ctb.total_amount_cents IS NOT NULL
          AND GREATEST(0, ctb.used_amount_cents - usage_totals.amount_cents) < ctb.total_amount_cents
          AND ctb.expires_at >= CURRENT_DATE
        THEN 'active'
        ELSE ctb.status
      END,
      updated_at = NOW()
    FROM usage_totals
    WHERE ctb.id = usage_totals.customer_bundle_id
    RETURNING usage_totals.amount_cents
  )
  SELECT COALESCE(SUM(amount_cents), 0)::INTEGER
  INTO _gift_restored_cents
  FROM restored_bundles;

  DELETE FROM public.bundle_amount_usages
  WHERE booking_id = _booking_id;

  -- Code promo : le compteur du code redescend et la ligne d'audit disparaît,
  -- pour que le client retrouve son droit et que le total remisé ne compte pas
  -- une remise qui n'a pas eu lieu.
  --
  -- Sauf si le lieu retient des frais d'annulation : il y a alors eu une
  -- transaction et un encaissement, le code est donc réputé consommé.
  WITH released AS (
    DELETE FROM public.promo_code_redemptions
    WHERE booking_id = _booking_id
      AND COALESCE(_cancellation_fee_amount, 0) = 0
    RETURNING promo_code_id
  )
  UPDATE public.promo_codes p
  SET redemption_count = GREATEST(0, p.redemption_count - 1),
      updated_at = NOW()
  FROM released
  WHERE p.id = released.promo_code_id;

  INSERT INTO public.booking_payment_infos (
    booking_id,
    customer_id,
    estimated_price,
    cancelled_at,
    cancelled_by,
    cancellation_fee_amount,
    refund_amount,
    updated_at
  )
  SELECT
    b.id,
    COALESCE(bpi.customer_id, b.customer_id),
    COALESCE(bpi.estimated_price, b.total_price),
    NOW(),
    _cancelled_by,
    COALESCE(_cancellation_fee_amount, 0),
    COALESCE(_refund_amount, 0),
    NOW()
  FROM public.bookings b
  LEFT JOIN public.booking_payment_infos bpi ON bpi.booking_id = b.id
  WHERE b.id = _booking_id
  ON CONFLICT (booking_id) DO UPDATE SET
    cancelled_at = EXCLUDED.cancelled_at,
    cancelled_by = EXCLUDED.cancelled_by,
    cancellation_fee_amount = EXCLUDED.cancellation_fee_amount,
    refund_amount = EXCLUDED.refund_amount,
    estimated_price = COALESCE(booking_payment_infos.estimated_price, EXCLUDED.estimated_price),
    customer_id = COALESCE(booking_payment_infos.customer_id, EXCLUDED.customer_id),
    updated_at = NOW();

  RETURN QUERY
  UPDATE public.bookings
  SET
    status = 'cancelled',
    cancellation_reason = NULLIF(BTRIM(_reason), ''),
    gift_amount_applied_cents = GREATEST(0, gift_amount_applied_cents - _gift_restored_cents),
    -- total_price reste le montant réellement dû au moment de la réservation ;
    -- seule la marque du code est retirée, et uniquement quand le droit a été
    -- rendu — avec des frais retenus, la réservation garde la trace du code.
    promo_code_id = CASE
      WHEN COALESCE(_cancellation_fee_amount, 0) = 0 THEN NULL
      ELSE promo_code_id
    END,
    promo_discount_cents = CASE
      WHEN COALESCE(_cancellation_fee_amount, 0) = 0 THEN 0
      ELSE promo_discount_cents
    END
  WHERE id = _booking_id
  RETURNING public.bookings.*;
END;
$$;
