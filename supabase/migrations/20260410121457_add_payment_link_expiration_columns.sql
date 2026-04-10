-- Ajout des colonnes pour la gestion de l'expiration et des relances des liens de paiement
ALTER TABLE booking_payment_infos
ADD COLUMN payment_link_stripe_id text,
ADD COLUMN payment_link_expires_at timestamptz,
ADD COLUMN payment_reminder_count integer DEFAULT 0,
ADD COLUMN payment_last_reminder_at timestamptz,
ADD COLUMN cancellation_reason text;