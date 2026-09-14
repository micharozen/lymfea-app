-- Test de réception des notifications push par thérapeute.
--
-- Pourquoi ici et pas dans une table dédiée : on n'affiche que le RÉSULTAT DU DERNIER
-- test par thérapeute (badge dans l'onglet Thérapeutes d'un lieu, et écran de réponse
-- dans la PWA). Aucun historique n'est demandé, donc l'état tient dans la ligne du
-- thérapeute. Bénéfice : les policies RLS existantes de `therapists` couvrent déjà tout
-- (le thérapeute met à jour sa propre ligne, l'admin/concierge la lit), et l'onglet admin
-- récupère le résultat dans sa requête existante sans requête supplémentaire.
--
-- Cycle de vie : l'edge function `send-notification-test` pose `pending` au moment de
-- l'envoi, puis bascule en `undelivered` si OneSignal ne trouve aucun abonnement.
-- Le thérapeute passe lui-même la ligne en `ok` ou `nok` depuis /pwa/notification-test.

ALTER TABLE public.therapists
  ADD COLUMN IF NOT EXISTS notification_test_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_test_status text,
  ADD COLUMN IF NOT EXISTS notification_test_error text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.therapists'::regclass
      AND conname = 'therapists_notification_test_status_check'
  ) THEN
    ALTER TABLE public.therapists
      ADD CONSTRAINT therapists_notification_test_status_check
      CHECK (notification_test_status IN ('pending', 'ok', 'nok', 'undelivered'));
  END IF;
END $$;

COMMENT ON COLUMN public.therapists.notification_test_sent_at IS
  'Horodatage du dernier envoi de notification de test vers ce thérapeute.';
COMMENT ON COLUMN public.therapists.notification_test_status IS
  'pending = notif envoyée sans réponse ; ok/nok = réponse du thérapeute ; undelivered = OneSignal n''a trouvé aucun abonnement.';
COMMENT ON COLUMN public.therapists.notification_test_error IS
  'Message brut OneSignal quand notification_test_status = undelivered (alias inconnu, aucun device abonné).';
