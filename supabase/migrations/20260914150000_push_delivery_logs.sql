-- ==============================================================================
-- Migration : push_delivery_logs
-- Description : journal d'envoi des notifications push.
--
--   OneSignal répond TOUJOURS 200, y compris quand personne n'est joignable.
--   `send-push-notification` ne testait que le code HTTP : un praticien sans
--   abonnement était compté comme notifié, sans trace nulle part. On journalise
--   donc le statut réel de chaque appel, lu sur le champ `id` de la réponse.
--
--   Table distincte de `push_notification_logs`, qui n'est PAS un journal : ses
--   lignes servent de registre de dédup du broadcast, avec une contrainte UNIQUE
--   (booking, user, prestation) load-bearing. Y écrire un envoi raté marquerait
--   le praticien comme déjà sollicité et bloquerait les relances (issue #547).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.push_delivery_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  booking_id uuid,
  notification_type text,
  status text NOT NULL,
  onesignal_notification_id text,
  error text,
  sent_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.push_delivery_logs
  ADD CONSTRAINT push_delivery_logs_pkey PRIMARY KEY (id);

ALTER TABLE public.push_delivery_logs
  ADD CONSTRAINT push_delivery_logs_status_check
  CHECK (status IN ('delivered', 'undelivered', 'error'));

ALTER TABLE public.push_delivery_logs
  ADD CONSTRAINT push_delivery_logs_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;

-- « Qui ne reçoit plus rien ? » : dernier envoi par praticien.
CREATE INDEX IF NOT EXISTS idx_push_delivery_logs_user_sent
  ON public.push_delivery_logs USING btree (user_id, sent_at DESC);

-- « La notif du 15/09 pour la résa #1937 est-elle partie ? »
CREATE INDEX IF NOT EXISTS idx_push_delivery_logs_booking
  ON public.push_delivery_logs USING btree (booking_id)
  WHERE booking_id IS NOT NULL;

-- Balayage des échecs récents, sans lire les lignes délivrées.
CREATE INDEX IF NOT EXISTS idx_push_delivery_logs_failures
  ON public.push_delivery_logs USING btree (sent_at DESC)
  WHERE status <> 'delivered';

COMMENT ON TABLE public.push_delivery_logs IS
  'Journal d''envoi des notifications push : une ligne par appel OneSignal, avec le statut réel de délivrance. Écrit par l''edge function send-push-notification.';
COMMENT ON COLUMN public.push_delivery_logs.status IS
  'delivered = OneSignal a renvoyé un id de notification ; undelivered = aucun abonnement joignable ; error = appel HTTP en échec.';
COMMENT ON COLUMN public.push_delivery_logs.onesignal_notification_id IS
  'Id OneSignal de la notification, pour retrouver ses stats de delivery côté dashboard.';

ALTER TABLE public.push_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view push delivery logs"
  ON public.push_delivery_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

GRANT ALL ON TABLE public.push_delivery_logs TO anon;
GRANT ALL ON TABLE public.push_delivery_logs TO authenticated;
GRANT ALL ON TABLE public.push_delivery_logs TO service_role;
