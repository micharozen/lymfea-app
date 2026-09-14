-- =========================================================================
-- Cloisonnement strict des fiches clients par organisation
-- =========================================================================
-- `customers` était une table globale : une fiche par numéro de téléphone,
-- partagée par tous les lieux et donc par toutes les organisations. Les
-- policies RLS ne portaient que sur le rôle — un admin d'organisation voyait
-- les clients des autres organisations, un praticien voyait toute la base.
-- L'overlay RESTRICTIVE de la migration multi-tenant (20260512000000) ciblait
-- les tables portant un `hotel_id` : `customers` n'en a pas, elle a donc été
-- silencieusement sautée.
--
-- Règle retenue : une fiche client appartient à une et une seule
-- organisation. Rien n'est partagé entre organisations — ni l'identité, ni
-- l'historique, ni les préférences. Un même individu fréquentant deux
-- organisations y possède deux fiches indépendantes.
--
-- Seule exception assumée : le compte de connexion du portail client
-- (`auth_user_id`) peut porter une fiche par organisation. Le client se
-- connecte une fois, mais ne voit que les données de l'organisation dont il
-- consulte le site — aucune donnée client ne traverse la frontière.
--
-- Au moment de cette migration, les 8 lieux de production appartiennent à une
-- seule organisation : le rattachement est donc sans ambiguïté et aucune fiche
-- n'a besoin d'être dupliquée.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Colonne organization_id
-- -------------------------------------------------------------------------

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

CREATE INDEX IF NOT EXISTS idx_customers_organization_id
  ON public.customers (organization_id);

COMMENT ON COLUMN public.customers.organization_id IS
  'Organisation propriétaire de la fiche. Une fiche client n''est jamais partagée entre organisations.';

-- -------------------------------------------------------------------------
-- 2. Backfill
-- -------------------------------------------------------------------------
-- Rattachement par l'organisation du lieu de la plus ancienne trace du client
-- (réservation, commodité, cure). Les fiches sans aucune trace prennent
-- l'organisation qui exploite les lieux, s'il n'y en a qu'une.

WITH first_trace AS (
  SELECT DISTINCT ON (customer_id) customer_id, organization_id
  FROM (
    SELECT b.customer_id, h.organization_id, b.created_at AS seen_at
    FROM public.bookings b
    JOIN public.hotels h ON h.id = b.hotel_id
    WHERE b.customer_id IS NOT NULL

    UNION ALL

    SELECT ab.customer_id, h.organization_id, ab.created_at
    FROM public.amenity_bookings ab
    JOIN public.hotels h ON h.id = ab.hotel_id
    WHERE ab.customer_id IS NOT NULL

    UNION ALL

    SELECT ctb.customer_id, h.organization_id, ctb.created_at
    FROM public.customer_treatment_bundles ctb
    JOIN public.hotels h ON h.id = ctb.hotel_id
    WHERE ctb.customer_id IS NOT NULL

    UNION ALL

    SELECT ctb.beneficiary_customer_id, h.organization_id, ctb.created_at
    FROM public.customer_treatment_bundles ctb
    JOIN public.hotels h ON h.id = ctb.hotel_id
    WHERE ctb.beneficiary_customer_id IS NOT NULL
  ) AS src
  ORDER BY customer_id, seen_at
)
UPDATE public.customers c
SET organization_id = ft.organization_id
FROM first_trace ft
WHERE c.id = ft.customer_id
  AND c.organization_id IS NULL;

-- Fiches sans aucune trace : l'organisation qui exploite les lieux. Si
-- plusieurs organisations en exploitent, on ne devine pas — la contrainte
-- NOT NULL ci-dessous échouera, ce qui est le comportement voulu (il faudra
-- alors trancher explicitement avant de rejouer).
UPDATE public.customers
SET organization_id = (
  SELECT h.organization_id FROM public.hotels h
  GROUP BY h.organization_id
  HAVING count(*) > 0
  LIMIT 1
)
WHERE organization_id IS NULL
  AND (SELECT count(DISTINCT organization_id) FROM public.hotels) = 1;

ALTER TABLE public.customers ALTER COLUMN organization_id SET NOT NULL;

-- -------------------------------------------------------------------------
-- 3. Unicités désormais portées par l'organisation
-- -------------------------------------------------------------------------
-- Le même numéro, le même email de connexion ou le même customer Stripe
-- peuvent exister dans deux organisations : ce sont deux clients distincts.

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_phone_key;
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_stripe_customer_id_key;
DROP INDEX IF EXISTS public.uq_customers_auth_user_id;

-- Contraintes (et non index partiels) : les valeurs NULL restent distinctes
-- entre elles, donc plusieurs fiches sans téléphone cohabitent dans une même
-- organisation — exactement le comportement de l'ancienne unicité globale. Une
-- contrainte nommée est par ailleurs la seule forme que PostgREST sache cibler
-- dans un `ON CONFLICT`, ce dont les upserts applicatifs ont besoin.
ALTER TABLE public.customers
  ADD CONSTRAINT customers_org_phone_key UNIQUE (organization_id, phone);

ALTER TABLE public.customers
  ADD CONSTRAINT customers_org_stripe_customer_id_key UNIQUE (organization_id, stripe_customer_id);

ALTER TABLE public.customers
  ADD CONSTRAINT customers_org_auth_user_id_key UNIQUE (organization_id, auth_user_id);

COMMENT ON COLUMN public.customers.auth_user_id IS
  'Compte Supabase Auth du portail client. Un même compte peut porter une fiche par organisation (unique par organisation, pas globalement).';

-- -------------------------------------------------------------------------
-- 4. Organisation de l'utilisateur courant
-- -------------------------------------------------------------------------
-- `get_user_organization_id` ne regarde que la table `admins` ; les concierges
-- portent leur propre `organization_id` depuis 20260513140000.

CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT organization_id FROM public.admins WHERE user_id = _user_id LIMIT 1),
    (SELECT organization_id FROM public.concierges WHERE user_id = _user_id LIMIT 1)
  )
$$;

COMMENT ON FUNCTION public.get_user_org_id(uuid) IS
  'Organisation de l''utilisateur, qu''il soit admin ou concierge. Null pour les praticiens (multi-organisations par nature) et les clients.';

GRANT EXECUTE ON FUNCTION public.get_user_org_id(uuid) TO authenticated, service_role;

-- Organisation propriétaire d'un lieu — point de résolution unique pour les
-- flux qui partent d'une réservation plutôt que d'un utilisateur connecté.
CREATE OR REPLACE FUNCTION public.get_hotel_org_id(_hotel_id text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT organization_id FROM public.hotels WHERE id = _hotel_id
$$;

GRANT EXECUTE ON FUNCTION public.get_hotel_org_id(text) TO anon, authenticated, service_role;

-- -------------------------------------------------------------------------
-- 5. Rattachement automatique à la création
-- -------------------------------------------------------------------------
-- Le code applicatif n'a pas à passer `organization_id` : une fiche créée par
-- un membre du staff appartient à son organisation. Les flux publics passent
-- par des RPC SECURITY DEFINER qui renseignent la colonne explicitement.

CREATE OR REPLACE FUNCTION public.set_customer_organization_id_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.get_user_org_id(auth.uid());
  END IF;

  -- Filet pour les écritures hors session utilisateur (service_role, seed,
  -- maintenance) : tant qu'une seule organisation exploite des lieux, le
  -- rattachement est sans ambiguïté. Dès qu'une deuxième organisation aura des
  -- lieux, ces appels devront passer l'organisation explicitement — l'exception
  -- ci-dessous le rendra visible immédiatement plutôt que de rattacher au
  -- hasard.
  IF NEW.organization_id IS NULL THEN
    SELECT h.organization_id INTO NEW.organization_id
    FROM public.hotels h
    GROUP BY h.organization_id
    HAVING count(*) > 0
    LIMIT 1;

    IF (SELECT count(DISTINCT organization_id) FROM public.hotels) <> 1 THEN
      NEW.organization_id := NULL;
    END IF;
  END IF;

  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Impossible de créer une fiche client sans organisation : passez organization_id explicitement.'
      USING ERRCODE = 'not_null_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_customer_organization_id_default() IS
  'Renseigne customers.organization_id depuis l''organisation de l''utilisateur courant, pour que le code applicatif n''ait jamais à la passer.';

DROP TRIGGER IF EXISTS customers_default_organization_id ON public.customers;
CREATE TRIGGER customers_default_organization_id
  BEFORE INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_customer_organization_id_default();

-- L'organisation d'une fiche ne change jamais : une fiche appartient à
-- l'organisation qui l'a créée, point.
CREATE OR REPLACE FUNCTION public.forbid_customer_organization_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Une fiche client ne peut pas changer d''organisation.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_freeze_organization_id ON public.customers;
CREATE TRIGGER customers_freeze_organization_id
  BEFORE UPDATE OF organization_id ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.forbid_customer_organization_change();

-- -------------------------------------------------------------------------
-- 6. RLS — overlay RESTRICTIVE
-- -------------------------------------------------------------------------
-- Même approche que la migration 20260512000000 : plutôt que de réécrire
-- chaque policy permissive existante, une policy RESTRICTIVE unique impose le
-- périmètre par-dessus. `anon` garde son blocage RESTRICTIVE existant, le flux
-- client public passant par des RPC SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.can_access_customer(_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = _customer_id
      AND (
        -- Staff Lymfea : accès global.
        public.is_super_admin(auth.uid())

        -- Le client lui-même, via le portail.
        OR c.auth_user_id = auth.uid()

        -- Admin ou concierge de l'organisation propriétaire.
        OR c.organization_id = public.get_user_org_id(auth.uid())

        -- Praticien : uniquement les clients qu'il a pris en soin. Le
        -- rattachement passe par trois chemins selon le cas (praticien
        -- principal, ligne de soin, roster de diffusion) : les trois sont
        -- couverts, sinon la PWA perdrait l'accès à des fiches légitimes.
        OR EXISTS (
          SELECT 1
          FROM public.bookings b
          JOIN public.therapists t ON t.user_id = auth.uid()
          WHERE b.customer_id = c.id
            AND (
              b.therapist_id = t.id
              OR EXISTS (
                SELECT 1 FROM public.booking_treatments bt
                WHERE bt.booking_id = b.id AND bt.therapist_id = t.id
              )
              OR EXISTS (
                SELECT 1 FROM public.booking_therapists bth
                WHERE bth.booking_id = b.id AND bth.therapist_id = t.id
              )
            )
        )
      )
  )
$$;

COMMENT ON FUNCTION public.can_access_customer(uuid) IS
  'Cloisonnement des fiches clients : super-admin, le client lui-même, l''organisation propriétaire, ou le praticien qui a pris le client en soin.';

GRANT EXECUTE ON FUNCTION public.can_access_customer(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Customer org isolation" ON public.customers;
CREATE POLICY "Customer org isolation" ON public.customers
  AS RESTRICTIVE TO authenticated
  USING (public.can_access_customer(id))
  WITH CHECK (
    -- À l'écriture, on ne peut poser que des fiches de sa propre organisation
    -- (le super-admin garde la main, les flux publics passent par des RPC).
    public.is_super_admin(auth.uid())
    OR organization_id = public.get_user_org_id(auth.uid())
    OR auth_user_id = auth.uid()
  );

-- -------------------------------------------------------------------------
-- 7. find_or_create_customer : dédoublonnage à l'intérieur d'une organisation
-- -------------------------------------------------------------------------
-- Point d'entrée unique de création client (flux public, PWA, admin). La
-- déduplication par téléphone puis par email ne vaut désormais qu'au sein
-- d'une organisation : deux organisations qui reçoivent le même individu
-- créent deux fiches distinctes.
--
-- L'organisation est résolue depuis le lieu de la réservation (`_hotel_id`),
-- sinon depuis l'utilisateur connecté. Sans l'un ni l'autre, la création est
-- refusée plutôt que rattachée au hasard.
--
-- L'ancienne signature à 6 arguments est supprimée : la laisser cohabiter
-- avec la nouvelle recréerait l'ambiguïté d'overload déjà corrigée par
-- 20260623120000 et 20260706140000.

DROP FUNCTION IF EXISTS public.find_or_create_customer(text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.find_or_create_customer(
  _phone text,
  _first_name text,
  _last_name text DEFAULT NULL,
  _email text DEFAULT NULL,
  _language text DEFAULT NULL,
  _civility text DEFAULT NULL,
  _hotel_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _customer_id UUID;
  _organization_id UUID;
  _normalized_phone TEXT;
  _normalized_email TEXT;
  _normalized_language TEXT;
  _normalized_civility TEXT;
BEGIN
  _organization_id := COALESCE(
    public.get_hotel_org_id(_hotel_id),
    public.get_user_org_id(auth.uid())
  );

  IF _organization_id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable : passez _hotel_id, ou appelez depuis un compte rattaché à une organisation.';
  END IF;

  _normalized_phone := REPLACE(COALESCE(_phone, ''), ' ', '');
  _normalized_email := NULLIF(BTRIM(COALESCE(_email, '')), '');
  _normalized_language := NULLIF(BTRIM(COALESCE(_language, '')), '');
  _normalized_civility := NULLIF(BTRIM(COALESCE(_civility, '')), '');

  -- Téléphone bouche-trou → on l'oublie complètement : ni clé de dédup, ni
  -- valeur stockée. Sinon toutes les réservations sans numéro finissent
  -- agrégées sous la première fiche créée avec ce faux numéro.
  IF is_placeholder_phone(_normalized_phone) THEN
    _normalized_phone := NULL;
  END IF;

  -- 1. Match on phone (primary key for deduplication), within the organization
  IF _normalized_phone IS NOT NULL THEN
    SELECT id INTO _customer_id
    FROM customers
    WHERE organization_id = _organization_id
      AND REPLACE(phone, ' ', '') = _normalized_phone;

    IF _customer_id IS NOT NULL THEN
      UPDATE customers
      SET
        email = COALESCE(_normalized_email, email),
        language = COALESCE(language, _normalized_language),
        civility = COALESCE(civility, _normalized_civility)
      WHERE id = _customer_id
        AND (
          (_normalized_email IS NOT NULL AND email IS DISTINCT FROM _normalized_email)
          OR (language IS NULL AND _normalized_language IS NOT NULL)
          OR (civility IS NULL AND _normalized_civility IS NOT NULL)
        );
      RETURN _customer_id;
    END IF;
  END IF;

  -- 2. Email fallback: find a customer with same email but no phone yet.
  --    Merge instead of creating a duplicate.
  IF _normalized_email IS NOT NULL THEN
    SELECT id INTO _customer_id
    FROM customers
    WHERE organization_id = _organization_id
      AND LOWER(BTRIM(email)) = LOWER(_normalized_email)
      AND (phone IS NULL OR BTRIM(phone) = '')
    LIMIT 1;

    IF _customer_id IS NOT NULL THEN
      UPDATE customers
      SET
        phone = COALESCE(_normalized_phone, phone),
        first_name = COALESCE(NULLIF(BTRIM(first_name), ''), _first_name),
        last_name  = COALESCE(NULLIF(BTRIM(last_name), ''),  _last_name),
        language   = COALESCE(language, _normalized_language),
        civility   = COALESCE(civility, _normalized_civility)
      WHERE id = _customer_id;
      RETURN _customer_id;
    END IF;
  END IF;

  -- 3. No match at all — insert new customer
  INSERT INTO customers (organization_id, phone, first_name, last_name, email, language, civility)
  VALUES (_organization_id, _normalized_phone, _first_name, _last_name, _normalized_email, _normalized_language, _normalized_civility)
  ON CONFLICT ON CONSTRAINT customers_org_phone_key DO NOTHING
  RETURNING id INTO _customer_id;

  -- 4. Handle rare race condition: another session inserted same phone concurrently
  IF _customer_id IS NULL AND _normalized_phone IS NOT NULL THEN
    SELECT id INTO _customer_id
    FROM customers
    WHERE organization_id = _organization_id
      AND phone = _normalized_phone;

    IF _customer_id IS NOT NULL THEN
      UPDATE customers
      SET
        email = COALESCE(_normalized_email, email),
        language = COALESCE(language, _normalized_language),
        civility = COALESCE(civility, _normalized_civility)
      WHERE id = _customer_id
        AND (
          (_normalized_email IS NOT NULL AND email IS DISTINCT FROM _normalized_email)
          OR (language IS NULL AND _normalized_language IS NOT NULL)
          OR (civility IS NULL AND _normalized_civility IS NOT NULL)
        );
    END IF;
  END IF;

  RETURN _customer_id;
END;
$$;

COMMENT ON FUNCTION public.find_or_create_customer(text, text, text, text, text, text, text) IS
  'Résout ou crée la fiche client d''une organisation. La déduplication (téléphone puis email) ne vaut qu''à l''intérieur de cette organisation.';

GRANT EXECUTE ON FUNCTION public.find_or_create_customer(text, text, text, text, text, text, text)
  TO anon, authenticated, service_role;
