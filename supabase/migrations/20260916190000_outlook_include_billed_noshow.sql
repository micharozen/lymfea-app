-- =========================================================================
-- get_dashboard_monthly_outlook — compter les no-show facturés
-- =========================================================================
-- Un no-show dont la prestation a bien été facturée (note de chambre, carte
-- capturée, paiement partenaire) est du chiffre d'affaires : le client la doit
-- et le thérapeute est déjà rémunéré dessus par `generate-therapist-invoices`.
-- Le `NOT IN ('cancelled','noshow')` les écartait du graphe mensuel, comme le
-- reste de l'app (cas #1613 au Cap d'Antibes : 480 € facturés en chambre,
-- absents de tous les totaux).
--
-- La règle est celle de `supabase/functions/_shared/bookingRevenue.ts` : un
-- no-show compte quand son `payment_status` engage un règlement, ou quand une
-- empreinte a été capturée (`cancellation_fee_amount > 0`). Les no-show restés
-- `pending` n'ont rien facturé et continuent d'être exclus.
--
-- Le montant retenu est celui réellement débité : les frais de no-show priment
-- sur `total_price`, qui peut être nul alors que l'empreinte a été capturée.
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
    COALESCE(
      SUM(
        CASE
          WHEN b.status IN ('noshow', 'no_show')
            AND COALESCE(pi.cancellation_fee_amount, 0) > 0
          THEN pi.cancellation_fee_amount
          ELSE COALESCE(b.total_price, 0)
        END
      ),
      0
    )::numeric                                              AS revenue,
    COUNT(*)::integer                                       AS booking_count
  FROM public.bookings b
  LEFT JOIN public.booking_payment_infos pi ON pi.booking_id = b.id
  WHERE b.booking_date >= date_trunc('month', _from_month)
    AND b.booking_date <  date_trunc('month', _to_month) + interval '1 month'
    AND b.status <> 'cancelled'
    AND (
      b.status NOT IN ('noshow', 'no_show')
      OR b.payment_status IN ('paid', 'charged_to_room', 'offert')
      OR COALESCE(pi.cancellation_fee_amount, 0) > 0
    )
    AND (_hotel_ids IS NULL OR b.hotel_id::text = ANY (_hotel_ids))
  GROUP BY 1, 2, 3;
$$;

COMMENT ON FUNCTION public.get_dashboard_monthly_outlook(text[], date, date) IS
  'Agrégat (mois × lieu × confirmé|en attente) des réservations non annulées, no-show facturés inclus, pour le graphe mensuel du dashboard admin. Montants dans la devise du lieu.';

GRANT EXECUTE ON FUNCTION public.get_dashboard_monthly_outlook(text[], date, date)
  TO authenticated;
