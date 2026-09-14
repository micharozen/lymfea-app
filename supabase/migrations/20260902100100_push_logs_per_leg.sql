-- ==============================================================================
-- Migration : push_logs_per_leg
-- Description : dédup des pushs praticiens par jambe (issue #547).
--
--   Le broadcast sollicite désormais les praticiens prestation par prestation :
--   sur un booking simple corps + visage, l'un peut prendre le corps et l'autre
--   le visage. La dédup UNIQUE (booking_id, user_id) l'en empêchait — un
--   praticien informé du corps ne pouvait plus jamais être notifié du visage
--   resté à pourvoir.
--
--   On journalise donc une ligne PAR jambe annoncée. Un praticien polyvalent
--   reçoit toujours UN seul push (il couvre plusieurs jambes) mais laisse
--   plusieurs lignes de log : la relance sur la jambe encore ouverte ne
--   re-sollicite que les praticiens jamais informés de CETTE prestation.
--
--   booking_treatment_id reste nullable pour les notifications qui ne portent sur
--   aucune jambe (flux assigné, choix de créneau). NULLS NOT DISTINCT garde la
--   dédup active sur ces lignes-là (PostgreSQL 15+ ; prod et staging sont en 17).
-- ==============================================================================

ALTER TABLE public.push_notification_logs
  ADD COLUMN IF NOT EXISTS booking_treatment_id uuid
    REFERENCES public.booking_treatments(id) ON DELETE CASCADE;

ALTER TABLE public.push_notification_logs
  DROP CONSTRAINT IF EXISTS push_notification_logs_booking_id_user_id_key;

ALTER TABLE public.push_notification_logs
  DROP CONSTRAINT IF EXISTS push_notification_logs_booking_user_leg_key;

ALTER TABLE public.push_notification_logs
  ADD CONSTRAINT push_notification_logs_booking_user_leg_key
  UNIQUE NULLS NOT DISTINCT (booking_id, user_id, booking_treatment_id);

CREATE INDEX IF NOT EXISTS idx_push_notification_logs_leg
  ON public.push_notification_logs USING btree (booking_treatment_id)
  WHERE booking_treatment_id IS NOT NULL;
