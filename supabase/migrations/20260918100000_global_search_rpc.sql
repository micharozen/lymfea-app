-- Recherche globale (⌘K) : le matching passe côté serveur.
--
-- Jusqu'ici la palette construisait un filtre PostgREST `or(...)` à la main,
-- avec un `ilike` par colonne. Trois limites tenaient les résultats hors de
-- portée :
--   * un `ilike` ne compare qu'une colonne, donc « Prénom Nom » ne matchait
--     ni first_name ni last_name — la saisie la plus naturelle ne rendait rien ;
--   * `ilike` ne déaccentue pas : « Benoit » ne trouvait pas « Benoît » ;
--   * un numéro tapé « 06 12 … » ne matchait pas un `+336…` stocké en E.164.
--
-- Ces fonctions cherchent sur une chaîne normalisée (minuscules, sans accents)
-- et exigent que *chaque* mot de la saisie y apparaisse : l'ordre des mots n'a
-- plus d'importance et « Nom Prénom » marche aussi. Le téléphone est comparé
-- chiffre à chiffre, plus les 9 derniers pour absorber l'indicatif.
--
-- Toutes sont SECURITY INVOKER : la RLS de l'appelant s'applique telle quelle,
-- un concierge ne voit donc que le périmètre de ses lieux.
-- Le matching n'utilise que `strpos`, jamais LIKE : la saisie ne peut pas
-- porter de métacaractère (`%`, `_`) qui élargirait le filtre.

-- ---------------------------------------------------------------------------
-- 1. Helpers de normalisation
-- ---------------------------------------------------------------------------

-- unaccent() est STABLE (il dépend d'un dictionnaire) ; on l'enveloppe comme
-- ailleurs dans ce schéma (cf. hotels.slug) pour pouvoir l'utiliser en SQL
-- inline. Aucun index ne dépend de cette immutabilité.
CREATE OR REPLACE FUNCTION public.search_normalize(_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT lower(public.unaccent(coalesce(_input, '')));
$$;

CREATE OR REPLACE FUNCTION public.search_digits(_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT regexp_replace(coalesce(_input, ''), '\D', '', 'g');
$$;

-- Les mots de la saisie, normalisés. Les séparateurs sont tout ce qui n'est ni
-- alphanumérique ni un caractère d'adresse e-mail, ce qui neutralise au passage
-- les virgules et parenthèses qui cassaient le filtre PostgREST.
--
-- Le résultat est un tableau, pas un SETOF : les fonctions de recherche le
-- calculent une seule fois dans un CTE et le comparent à chaque ligne. Réévaluer
-- la tokenisation par ligne coûtait ~6× le temps de requête sur 5 000 clients.
CREATE OR REPLACE FUNCTION public.search_tokens(_query text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT coalesce(array_agg(token), ARRAY[]::text[])
  FROM unnest(
    string_to_array(
      regexp_replace(public.search_normalize(_query), '[^a-z0-9@._+-]+', ' ', 'g'),
      ' '
    )
  ) AS token
  WHERE length(token) > 0;
$$;

-- Tous les mots de la saisie sont-ils présents dans la chaîne cherchée ?
-- Une saisie sans aucun mot exploitable (« %%% », « --- ») ne matche rien :
-- sans cette garde, le NOT EXISTS sur un ensemble vide ramènerait toute la table.
CREATE OR REPLACE FUNCTION public.search_haystack_matches(_haystack text, _tokens text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT cardinality(coalesce(_tokens, ARRAY[]::text[])) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(_tokens) AS token
      WHERE strpos(public.search_normalize(_haystack), token) = 0
    );
$$;

-- Un numéro correspond s'il contient les chiffres tapés, ou si les 9 derniers
-- chiffres coïncident — « 0612345678 » retrouve « +33612345678 » et l'inverse.
-- `_digits` est déjà normalisé par l'appelant (voir search_digits).
CREATE OR REPLACE FUNCTION public.search_phone_matches(_phone text, _digits text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT length(coalesce(_digits, '')) >= 4
    AND length(public.search_digits(_phone)) > 0
    AND (
      strpos(public.search_digits(_phone), _digits) > 0
      OR (
        length(_digits) >= 9
        AND right(public.search_digits(_phone), 9) = right(_digits, 9)
      )
    );
$$;

-- 0 = le nom commence par la saisie, 1 = elle apparaît ailleurs. Sert à faire
-- remonter « Marie Dupont » avant « Jean Marié » quand on tape « mar ».
CREATE OR REPLACE FUNCTION public.search_rank(_label text, _query text)
RETURNS int
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN strpos(public.search_normalize(_label), public.search_normalize(btrim(_query))) = 1 THEN 0
    ELSE 1
  END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Recherche de clients
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.search_customers(_query text, _limit int DEFAULT 20)
RETURNS SETOF public.customers
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS MATERIALIZED (
    SELECT
      btrim(coalesce(_query, '')) AS raw,
      public.search_tokens(_query) AS tokens,
      public.search_digits(_query) AS digits
  )
  SELECT c.*
  FROM public.customers c
  CROSS JOIN q
  WHERE length(q.raw) >= 2
    AND (
      public.search_haystack_matches(
        coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '') || ' ' || coalesce(c.email, ''),
        q.tokens
      )
      OR public.search_phone_matches(c.phone, q.digits)
    )
  ORDER BY
    public.search_rank(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''), q.raw),
    c.last_name NULLS LAST,
    c.first_name NULLS LAST,
    c.id
  LIMIT least(greatest(coalesce(_limit, 20), 1), 50);
$$;

-- ---------------------------------------------------------------------------
-- 3. Recherche de thérapeutes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.search_therapists(_query text, _limit int DEFAULT 20)
RETURNS SETOF public.therapists
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS MATERIALIZED (
    SELECT
      btrim(coalesce(_query, '')) AS raw,
      public.search_tokens(_query) AS tokens,
      public.search_digits(_query) AS digits
  )
  SELECT t.*
  FROM public.therapists t
  CROSS JOIN q
  WHERE length(q.raw) >= 2
    AND (
      public.search_haystack_matches(
        coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, '') || ' ' || coalesce(t.email, ''),
        q.tokens
      )
      OR public.search_phone_matches(t.phone, q.digits)
    )
  ORDER BY
    public.search_rank(coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, ''), q.raw),
    t.last_name NULLS LAST,
    t.first_name NULLS LAST,
    t.id
  LIMIT least(greatest(coalesce(_limit, 20), 1), 50);
$$;

-- ---------------------------------------------------------------------------
-- 4. Recherche de réservations
-- ---------------------------------------------------------------------------

-- Renvoie des identifiants : la palette réhydrate ensuite les lignes avec ses
-- propres embeds (lieu, salle, soins) plutôt que de figer ici un jeu de
-- colonnes qui divergerait de l'écran.
--
-- Une réservation est trouvée par le nom porté sur la réservation, par celui de
-- la fiche client rattachée (les deux divergent quand la fiche a été corrigée
-- après coup), par l'e-mail, le téléphone, le numéro de réservation ou le code
-- promo utilisé.
CREATE OR REPLACE FUNCTION public.search_booking_ids(_query text, _limit int DEFAULT 20)
RETURNS TABLE (id uuid, booking_date date, rank int)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS MATERIALIZED (
    SELECT
      btrim(coalesce(_query, '')) AS raw,
      public.search_tokens(_query) AS tokens,
      public.search_digits(_query) AS digits
  )
  SELECT
    b.id,
    b.booking_date,
    CASE
      WHEN q.raw ~ '^\d+$' AND b.booking_id = q.raw::bigint THEN 0
      ELSE 1
    END AS rank
  FROM public.bookings b
  LEFT JOIN public.customers c ON c.id = b.customer_id
  LEFT JOIN public.promo_codes p ON p.id = b.promo_code_id
  CROSS JOIN q
  WHERE length(q.raw) >= 2
    AND (
      public.search_haystack_matches(
        coalesce(b.client_first_name, '') || ' ' || coalesce(b.client_last_name, '') || ' '
          || coalesce(b.client_email, '') || ' '
          || coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '') || ' '
          || coalesce(c.email, '') || ' '
          || coalesce(p.code, ''),
        q.tokens
      )
      OR public.search_phone_matches(b.phone, q.digits)
      OR public.search_phone_matches(c.phone, q.digits)
      -- Numéro de réservation : match exact, jamais une sous-chaîne — « 12 »
      -- ne doit pas ramener la #1234.
      OR (q.raw ~ '^\d+$' AND b.booking_id = q.raw::bigint)
    )
  ORDER BY rank, b.booking_date DESC NULLS LAST, b.id
  LIMIT least(greatest(coalesce(_limit, 20), 1), 50);
$$;

-- ---------------------------------------------------------------------------
-- 5. Droits
-- ---------------------------------------------------------------------------

-- Les helpers restent exécutables par l'appelant (les RPC sont SECURITY INVOKER,
-- elles les appellent sous son rôle), mais pas par un visiteur non connecté.
REVOKE EXECUTE ON FUNCTION public.search_normalize(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_digits(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_tokens(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_haystack_matches(text, text[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_phone_matches(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_rank(text, text) FROM anon;

REVOKE EXECUTE ON FUNCTION public.search_customers(text, int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_therapists(text, int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_booking_ids(text, int) FROM anon;

GRANT EXECUTE ON FUNCTION public.search_customers(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_therapists(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_booking_ids(text, int) TO authenticated;
