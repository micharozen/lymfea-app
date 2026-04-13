-- Ajout des colonnes pour la gestion de l'expiration et des relances des liens de paiement
ALTER TABLE booking_payment_infos
ADD COLUMN payment_link_stripe_id text,
ADD COLUMN payment_link_expires_at timestamptz,
ADD COLUMN payment_reminder_count integer DEFAULT 0,
ADD COLUMN payment_last_reminder_at timestamptz,
ADD COLUMN cancellation_reason text;

-- Activer les extensions nécessaires (si ce n'est pas déjà fait)
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1. Cron pour annuler les liens expirés (Toutes les 15 minutes)
SELECT cron.schedule(
  'check-expired-payment-links-cron',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
      url:='https://[PROJECT_REF].supabase.co/functions/v1/check-expired-payment-links',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer [SERVICE_ROLE_KEY]"}'::jsonb
  )
  $$
);

-- 2. Cron pour envoyer les relances (Toutes les 30 minutes)
SELECT cron.schedule(
  'send-payment-reminder-cron',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
      url:='https://[PROJECT_REF].supabase.co/functions/v1/send-payment-reminder',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer [SERVICE_ROLE_KEY]"}'::jsonb
  )
  $$
);