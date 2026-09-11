-- =========================================================================
-- Jeu d'essai local : une seconde organisation
-- =========================================================================
-- Le seed ne contient qu'une organisation, ce qui rend le cloisonnement des
-- fiches clients invisible : tout le monde voit tout parce qu'il n'y a qu'un
-- périmètre. Ce script ajoute une deuxième organisation avec son lieu, son
-- admin et ses clients, pour pouvoir constater la séparation depuis l'app.
--
-- Usage :
--   docker exec -i supabase_db_<ref> psql -U postgres -d postgres \
--     < scripts/local-second-org.sql
--
-- À rejouer après chaque `supabase db reset`. Strictement local — ne jamais
-- appliquer sur staging ni en production.
-- =========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Organisation B + son lieu
-- ---------------------------------------------------------------------------

INSERT INTO public.organizations (id, name, slug)
VALUES ('b0000000-0000-0000-0000-0000000000b1', 'Spa Lumière (test)', 'spa-lumiere-test')
ON CONFLICT (id) DO NOTHING;

-- La facturation par siège exige un abonnement actif : hors sujet ici.
ALTER TABLE public.hotels DISABLE TRIGGER USER;

INSERT INTO public.hotels (
  id, name, organization_id, slug, venue_type, currency, country, timezone,
  status, inbound_email_alias, inbound_email_domain
) VALUES (
  'b0000000-0000-0000-0000-0000000000b2', 'Spa Lumière — Lyon',
  'b0000000-0000-0000-0000-0000000000b1', 'spa-lumiere-lyon', 'spa',
  'EUR', 'FR', 'Europe/Paris', 'active', 'spa-lumiere-lyon', 'hello.eiaspa.fr'
) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.hotels ENABLE TRIGGER USER;

-- ---------------------------------------------------------------------------
-- Un admin simple par organisation
-- ---------------------------------------------------------------------------
-- `admin@oom.dev` (le seed) est super-admin : il voit tout, donc il ne permet
-- pas d'observer le cloisonnement. On crée ici un admin ordinaire par
-- organisation, rattaché à elle et à elle seule.
--
--   email    : admin-<slug de l'organisation>@lymfea.dev
--   password : password
--
-- Idempotent : rejouable sans créer de doublon, et couvre automatiquement
-- toute organisation ajoutée plus tard.

DO $$
DECLARE
  _org RECORD;
  _email text;
  _user_id uuid;
  _n integer := 0;
BEGIN
  FOR _org IN SELECT id, name, slug FROM public.organizations ORDER BY name LOOP
    _email := 'admin-' || _org.slug || '@lymfea.dev';

    SELECT id INTO _user_id FROM auth.users WHERE email = _email;

    IF _user_id IS NULL THEN
      _user_id := gen_random_uuid();
      INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        created_at, updated_at, confirmation_token, recovery_token,
        email_change_token_new, email_change
      ) VALUES (
        _user_id, '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', _email,
        crypt('password', gen_salt('bf')), now(), now(), now(), '', '', '', ''
      );
    END IF;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'admin')
    ON CONFLICT DO NOTHING;

    IF NOT EXISTS (SELECT 1 FROM public.admins WHERE user_id = _user_id) THEN
      INSERT INTO public.admins (
        user_id, email, first_name, last_name, phone, is_super_admin, organization_id
      ) VALUES (
        _user_id, _email, 'Admin', _org.name, '600000000', false, _org.id
      );
      _n := _n + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '% admin(s) cree(s)', _n;
END $$;

-- ---------------------------------------------------------------------------
-- Clients de l'organisation B
-- ---------------------------------------------------------------------------
-- Le premier porte volontairement le téléphone d'une cliente de l'organisation
-- A (Sophie Martin, +33612345678) : c'est la même personne dans la vraie vie,
-- mais deux fiches indépendantes, une par organisation.

INSERT INTO public.customers (
  id, organization_id, first_name, last_name, email, phone, language, profile_completed
) VALUES
  ('b0000000-0000-0000-0000-0000000005f1', 'b0000000-0000-0000-0000-0000000000b1',
   'Sophie', 'Martin', 'sophie.martin@example.com', '+33612345678', 'fr', true),
  ('b0000000-0000-0000-0000-0000000005f2', 'b0000000-0000-0000-0000-0000000000b1',
   'Inès', 'Fabre', 'ines.fabre@example.com', '+33611223344', 'fr', true)
ON CONFLICT (id) DO NOTHING;

-- Une réservation dans le lieu B, pour que la fiche ait un historique.
INSERT INTO public.bookings (
  id, hotel_id, customer_id, booking_date, booking_time, duration, total_price,
  status, client_first_name, client_last_name, phone
) VALUES (
  'b0000000-0000-0000-0000-0000000002f1', 'b0000000-0000-0000-0000-0000000000b2',
  'b0000000-0000-0000-0000-0000000005f1', CURRENT_DATE + 3, '10:00', 60, 120,
  'confirmed', 'Sophie', 'Martin', '+33612345678'
) ON CONFLICT (id) DO NOTHING;

COMMIT;

\echo ''
\echo '--- Clients par organisation ---'
SELECT o.name AS organisation, count(c.id) AS clients
FROM public.organizations o
LEFT JOIN public.customers c ON c.organization_id = o.id
GROUP BY o.name ORDER BY clients DESC;

\echo ''
\echo '--- Le meme numero, deux fiches independantes ---'
SELECT c.first_name, c.last_name, c.phone, o.name AS organisation
FROM public.customers c
JOIN public.organizations o ON o.id = c.organization_id
WHERE c.phone = '+33612345678'
ORDER BY o.name;

\echo ''
\echo '--- Acces (mot de passe : password) ---'
SELECT
  u.email,
  CASE WHEN a.is_super_admin THEN 'super-admin (voit tout)' ELSE 'admin simple' END AS profil,
  o.name AS organisation,
  (SELECT count(*) FROM public.customers c WHERE c.organization_id = a.organization_id) AS clients_visibles
FROM public.admins a
JOIN auth.users u ON u.id = a.user_id
LEFT JOIN public.organizations o ON o.id = a.organization_id
ORDER BY a.is_super_admin DESC, o.name;
