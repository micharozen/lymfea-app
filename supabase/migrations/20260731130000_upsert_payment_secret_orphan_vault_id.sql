-- upsert_payment_secret : ne jamais faire confiance à p_existing_id sans vérifier.
--
-- vault.update_secret() est un simple UPDATE ... WHERE id = secret_id : quand la
-- ligne n'existe plus, il ne touche rien et ne lève aucune erreur. La fonction
-- renvoyait malgré tout p_existing_id, donc hotel_payment_configs conservait un
-- stripe_vault_secret_id fantôme et le callback OAuth se terminait « avec succès »
-- sans qu'aucun token n'ait été écrit. Ensuite get_payment_stripe_secrets renvoie
-- NULL et stripe-resolver retombe en silence sur la clé plateforme.
--
-- Cas observé sur staging : vault.secrets n'est pas copié lors d'un clone depuis la
-- prod, donc toutes les configs héritées pointent vers des secrets inexistants.
--
-- On repasse aussi par le nom (unique) avant de créer : un secret orphelin portant
-- déjà v_name ferait échouer vault.create_secret sur la contrainte d'unicité.

CREATE OR REPLACE FUNCTION public.upsert_payment_secret(
  p_hotel_id    TEXT,
  p_provider    TEXT,         -- 'stripe' | 'adyen'
  p_payload     JSONB,
  p_existing_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id UUID;
  v_name      TEXT;
BEGIN
  IF p_provider NOT IN ('stripe', 'adyen') THEN
    RAISE EXCEPTION 'Unsupported provider: %', p_provider;
  END IF;

  v_name := 'payment_' || p_provider || '_' || p_hotel_id;

  IF p_existing_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM vault.secrets WHERE id = p_existing_id) THEN
    PERFORM vault.update_secret(p_existing_id, p_payload::text, v_name);
    RETURN p_existing_id;
  END IF;

  SELECT id INTO v_secret_id FROM vault.secrets WHERE name = v_name;

  IF v_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_secret_id, p_payload::text, v_name);
    RETURN v_secret_id;
  END IF;

  v_secret_id := vault.create_secret(
    p_payload::text,
    v_name,
    p_provider || ' credentials for hotel ' || p_hotel_id
  );
  RETURN v_secret_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_payment_secret(TEXT, TEXT, JSONB, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_payment_secret(TEXT, TEXT, JSONB, UUID) TO service_role;
