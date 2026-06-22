-- ============================================================
-- Store the rendered HTML body of booking emails on audit_log
-- so the booking history can show a preview of each sent email.
-- ============================================================

ALTER TABLE audit_log ADD COLUMN email_html TEXT;

COMMENT ON COLUMN audit_log.email_html IS
  'Corps HTML de l''email envoyé (renseigné uniquement pour change_type=action / action=email_sent).';
