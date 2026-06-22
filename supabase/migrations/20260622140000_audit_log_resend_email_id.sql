-- ============================================================
-- Store the Resend email id alongside email-sent history lines so
-- template-based emails (no local HTML) can be previewed on demand
-- by fetching the rendered body from Resend (GET /emails/:id).
-- ============================================================

ALTER TABLE audit_log ADD COLUMN resend_email_id TEXT;

COMMENT ON COLUMN audit_log.resend_email_id IS
  'Identifiant de l''email Resend (renseigné pour action=email_sent). Permet de récupérer le HTML rendu des emails template via l''API Resend.';
