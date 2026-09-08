-- =========================================================================
-- get_dashboard_monthly_outlook — agrégat mensuel du carnet de commandes
-- =========================================================================
-- Le dashboard rapatriait jusqu'ici ~18 mois de lignes brutes de `bookings`
-- (19 colonnes + jointure sur les soins, paginées par lots de 1000) pour n'en
-- tirer qu'une somme par (mois × lieu × statut). Cette RPC fait l'agrégation
-- côté Postgres : quelques dizaines de lignes au lieu de plusieurs milliers.
--
-- SECURITY INVOKER, pas DEFINER : la RLS de `bookings` s'applique telle quelle
-- (les admins y voient déjà toutes les organisations, les concierges et les
-- thérapeutes restent restreints), et le cloisonnement par organisation reste
-- porté par `_hotel_ids`, exactement comme le `.in("hotel_id", …)` qu'elle
-- remplace. NULL = pas de restriction (mode super-admin « toutes
-- organisations »).
--
-- Le regroupement par hotel_id est ce qui rend l'agrégation SQL exacte : la
-- conversion en EUR étant un simple facteur par devise de lieu, convertir la
-- somme du groupe équivaut à sommer les conversions ligne à ligne. Les
-- montants sont donc renvoyés dans la devise du lieu, non convertis.
--
-- Le CASE reproduit la logique de src/lib/monthlyOutlook.ts (« pending » d'un
-- côté, tout le reste de l'autre) et le NOT IN reproduit EXCLUDED_STATUSES.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_monthly_outlook(
  _hotel_ids  text[],
  _from_month date,
  _to_month   date
)
RETURNS TABLE (
  month_key     text,
  hotel_id      text,
  bucket        text,
  revenue       numeric,
  booking_count integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    to_char(date_trunc('month', b.booking_date), 'YYYY-MM') AS month_key,
    b.hotel_id::text                                        AS hotel_id,
    CASE WHEN b.status = 'pending' THEN 'pending' ELSE 'confirmed' END AS bucket,
    COALESCE(SUM(b.total_price), 0)::numeric                AS revenue,
    COUNT(*)::integer                                       AS booking_count
  FROM public.bookings b
  WHERE b.booking_date >= date_trunc('month', _from_month)
    AND b.booking_date <  date_trunc('month', _to_month) + interval '1 month'
    AND b.status NOT IN ('cancelled', 'noshow')
    AND (_hotel_ids IS NULL OR b.hotel_id::text = ANY (_hotel_ids))
  GROUP BY 1, 2, 3;
$$;

COMMENT ON FUNCTION public.get_dashboard_monthly_outlook(text[], date, date) IS
  'Agrégat (mois × lieu × confirmé|en attente) des réservations non annulées, pour le graphe mensuel du dashboard admin. Montants dans la devise du lieu.';

GRANT EXECUTE ON FUNCTION public.get_dashboard_monthly_outlook(text[], date, date)
  TO authenticated;
