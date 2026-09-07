-- Une installation de Stripe App appartient au COMPTE Stripe, pas au lieu.
--
-- Stripe émet un couple (access token 1h, refresh token rotatif à usage unique)
-- par installation, c'est-à-dire par couple (app × compte Stripe). Or les tokens
-- sont stockés par hotel_id : dès que deux lieux sont connectés au même
-- stripe_account_id, la connexion du second révoque les tokens du premier, et le
-- refresh du premier échoue ensuite définitivement avec
--   invalid_grant: Refresh token does not exist: rt_…
-- Le lieu tombe alors en « Expired API Key provided: rk_… » (platform_api_key_expired)
-- jusqu'à une reconnexion manuelle — laquelle casse à son tour le lieu voisin.
--
-- Constaté sur staging le 04/09/2026 : 5 lieux OAuth pour 2 comptes Stripe.
--
-- Le côté applicatif écrit désormais le couple de tokens sur TOUS les lieux
-- partageant le même stripe_account_id. Reste la course : deux lieux frères qui
-- rafraîchissent en même temps consomment le même refresh token à usage unique et
-- en perdent un. D'où ce claim, qui sérialise le rafraîchissement par compte.

ALTER TABLE public.hotel_payment_configs
  ADD COLUMN IF NOT EXISTS oauth_refresh_claimed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.hotel_payment_configs.oauth_refresh_claimed_at IS
  'Instant du dernier rafraîchissement OAuth réservé pour ce compte Stripe. Sérialise les refresh concurrents entre lieux partageant la même installation ; expire par TTL, jamais relâché explicitement.';

-- Réserve le droit de rafraîchir les tokens d'un compte Stripe.
--
-- Renvoie TRUE au premier appelant, puis FALSE aux suivants tant que le TTL n'est
-- pas écoulé — le perdant n'a pas à attendre un verrou, il relit simplement le
-- Vault où le gagnant aura écrit le nouveau couple. Le claim n'est jamais relâché
-- explicitement : un process mort ne bloque donc que le temps du TTL, et un refresh
-- réussi rend les suivants inutiles pour une heure de toute façon.
--
-- Un compte inconnu (aucune ligne) renvoie TRUE : il n'y a rien à sérialiser.
CREATE OR REPLACE FUNCTION public.claim_stripe_oauth_refresh(
  p_account_id  TEXT,
  p_ttl_seconds INTEGER DEFAULT 30
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  IF p_account_id IS NULL OR p_account_id = '' THEN
    RETURN TRUE;
  END IF;

  UPDATE public.hotel_payment_configs
     SET oauth_refresh_claimed_at = now()
   WHERE stripe_account_id = p_account_id
     AND auth_method = 'oauth'
     AND (
       oauth_refresh_claimed_at IS NULL
       OR oauth_refresh_claimed_at < now() - make_interval(secs => p_ttl_seconds)
     );

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    RETURN TRUE;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
      FROM public.hotel_payment_configs
     WHERE stripe_account_id = p_account_id
       AND auth_method = 'oauth'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_stripe_oauth_refresh(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_oauth_refresh(TEXT, INTEGER) TO service_role;
