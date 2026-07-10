-- ==============================================================================
-- Migration : email_opt_outs
-- Description : Désinscription RGPD des mails de relance (paniers abandonnés).
--   Le consentement porte sur l'ADRESSE MAIL, pas sur la fiche customer :
--   find_or_create_customer déduplique par téléphone, donc un même individu peut
--   avoir plusieurs customers partageant un email. Une table dédiée survit aux
--   doublons, aux fusions, et aux futurs destinataires sans fiche client.
--
--   - Table email_opt_outs (email = PK, token secret pour le lien du mail)
--   - RPC issue_email_opt_out_token  (service_role — appelée par la cron)
--   - RPC unsubscribe_email          (anon — appelée par la page /unsubscribe)
--   - Cadence des relances portée à 2 envois max
-- ==============================================================================

CREATE TABLE IF NOT EXISTS email_opt_outs (
  email        TEXT PRIMARY KEY,
  -- Secret non énumérable placé dans l'URL du mail. On ne peut pas y mettre un
  -- id de customer : il serait devinable, et désinscrirait n'importe qui.
  token        UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  -- NULL = a reçu un lien, n'a rien fait. Non NULL = a demandé l'arrêt.
  opted_out_at TIMESTAMPTZ,
  source       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE email_opt_outs IS
  'Opt-out marketing par adresse mail. Ne coupe que les relances (paniers abandonnés) — les mails transactionnels (confirmation, rappel J-1, facture) restent envoyés.';

-- Aucune policy : la table n''est jamais lue par un client. Tout passe par les
-- deux RPC SECURITY DEFINER ci-dessous et par le service_role de la cron.
ALTER TABLE email_opt_outs ENABLE ROW LEVEL SECURITY;

-- ─── issue_email_opt_out_token (cron only) ──────────────────────────────────
-- Renvoie le token de l'adresse, en le créant au premier envoi. Idempotent :
-- le DO UPDATE est un no-op dont le seul rôle est de faire remonter RETURNING
-- sur une ligne déjà existante (DO NOTHING ne renvoie rien).
CREATE OR REPLACE FUNCTION issue_email_opt_out_token(_email TEXT, _source TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _token UUID;
BEGIN
  IF _email IS NULL OR btrim(_email) = '' THEN
    RETURN NULL;
  END IF;

  INSERT INTO email_opt_outs (email, source)
  VALUES (lower(btrim(_email)), _source)
  ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
  RETURNING token INTO _token;

  RETURN _token;
END;
$$;

REVOKE ALL ON FUNCTION issue_email_opt_out_token(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION issue_email_opt_out_token(TEXT, TEXT) TO service_role;

-- ─── unsubscribe_email (page publique /unsubscribe) ─────────────────────────
-- Idempotent, et n''expose jamais l''identité derrière le token : un token
-- inconnu renvoie simplement false, la page affiche le même message.
CREATE OR REPLACE FUNCTION unsubscribe_email(_token UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _found BOOLEAN;
BEGIN
  UPDATE email_opt_outs
  SET opted_out_at = COALESCE(opted_out_at, now())
  WHERE token = _token
  RETURNING TRUE INTO _found;

  RETURN COALESCE(_found, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION unsubscribe_email(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION unsubscribe_email(UUID) TO anon, authenticated, service_role;

-- ─── Cadence : 2 relances maximum ───────────────────────────────────────────
-- R1 une heure après l'abandon ; R2 seulement si le créneau approche.
DROP INDEX IF EXISTS idx_checkout_intents_pending_reminder;

CREATE INDEX IF NOT EXISTS idx_checkout_intents_pending_reminder
  ON checkout_intents (created_at)
  WHERE converted_at IS NULL AND reminder_count < 2;
