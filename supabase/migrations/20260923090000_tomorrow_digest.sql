-- Récap J-1 des rendez-vous pour les thérapeutes.
--
-- Pas de table dédiée : le récap est une `notifications` de type 'daily_digest'.
-- On hérite ainsi de la liste PWA, du badge non-lu, du realtime et des policies
-- RLS existantes. Les deux colonnes ci-dessous portent ce dont ce type a besoin
-- en propre : la journée récapitulée, et l'accusé de réception explicite
-- (« Planning vu »), distinct de `read` qui signifie seulement « ouvert ».
--
-- L'historique d'envoi (succès, erreur, relances) vit déjà dans
-- `push_delivery_logs`, alimenté par l'edge function `send-push-notification`.

ALTER TABLE "public"."notifications"
  ADD COLUMN IF NOT EXISTS "target_date" date,
  ADD COLUMN IF NOT EXISTS "acknowledged_at" timestamp with time zone;

COMMENT ON COLUMN "public"."notifications"."target_date" IS
  'Journée récapitulée (wall-clock du lieu). Renseignée pour type=''daily_digest''.';
COMMENT ON COLUMN "public"."notifications"."acknowledged_at" IS
  'Confirmation explicite du thérapeute (« Planning vu »), distincte de read (ouvert).';

-- Verrou de déduplication : une seule synthèse par thérapeute et par journée.
-- C'est ce conflit qui arbitre le cron (ON CONFLICT DO NOTHING) — sans lui, deux
-- exécutions rapprochées enverraient deux pushs.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_notifications_daily_digest"
  ON "public"."notifications" ("user_id", "target_date")
  WHERE "type" = 'daily_digest';

-- Lecture du suivi par la coordinatrice.
--
-- Un SELECT direct ne conviendrait pas : la RLS de `notifications` limite chacun
-- aux siennes, et surtout il faut faire apparaître les thérapeutes qui ont des
-- rendez-vous demain *sans* avoir reçu de synthèse — c'est justement la ligne
-- sur laquelle la coordinatrice doit agir.
CREATE OR REPLACE FUNCTION "public"."admin_tomorrow_digests"(
  "p_target_date" date,
  "p_organization_id" "uuid" DEFAULT NULL
)
RETURNS TABLE (
  "therapist_id" "uuid",
  "first_name" "text",
  "last_name" "text",
  "profile_image" "text",
  "booking_count" integer,
  "hotel_names" "text"[],
  "first_booking_time" "text",
  "status" "text",
  "send_count" integer,
  "last_sent_at" timestamp with time zone,
  "read_at" timestamp with time zone,
  "acknowledged_at" timestamp with time zone,
  "last_error" "text"
)
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
BEGIN
  -- Cloisonnement : super-admin partout, admin seulement dans son organisation.
  IF NOT public.is_super_admin(auth.uid()) THEN
    IF p_organization_id IS NULL
       OR p_organization_id IS DISTINCT FROM public.get_user_organization_id(auth.uid()) THEN
      RAISE EXCEPTION 'not authorized';
    END IF;
  END IF;

  RETURN QUERY
  WITH day_bookings AS (
    SELECT
      b.id,
      b.booking_time,
      h.name AS hotel_name,
      -- Un rendez-vous « appartient » à un thérapeute par trois chemins :
      -- l'affectation principale, la prestation qu'il porte (duo), ou son
      -- acceptation de la diffusion.
      t.therapist_id
    FROM public.bookings b
    JOIN public.hotels h ON h.id = b.hotel_id
    CROSS JOIN LATERAL (
      SELECT DISTINCT x.therapist_id
      FROM (
        SELECT b.therapist_id
        UNION
        SELECT bt.therapist_id FROM public.booking_treatments bt WHERE bt.booking_id = b.id
        UNION
        SELECT bth.therapist_id FROM public.booking_therapists bth
         WHERE bth.booking_id = b.id AND bth.status = 'accepted'
      ) x
      WHERE x.therapist_id IS NOT NULL
    ) t
    WHERE b.booking_date = p_target_date
      AND b.status NOT IN ('cancelled', 'canceled', 'Annulé', 'declined', 'expired', 'no_show', 'noshow')
      AND (p_organization_id IS NULL OR h.organization_id = p_organization_id)
  ),
  per_therapist AS (
    SELECT
      db.therapist_id,
      COUNT(*)::integer                                   AS booking_count,
      array_agg(DISTINCT db.hotel_name)                   AS hotel_names,
      to_char(MIN(db.booking_time), 'HH24:MI')            AS first_booking_time
    FROM day_bookings db
    GROUP BY db.therapist_id
  ),
  digests AS (
    SELECT
      th.id AS therapist_id,
      n.read,
      n.created_at,
      n.acknowledged_at
    FROM public.notifications n
    JOIN public.therapists th ON th.user_id = n.user_id
    WHERE n.type = 'daily_digest'
      AND n.target_date = p_target_date
  )
  SELECT
    th.id,
    th.first_name,
    th.last_name,
    th.profile_image,
    COALESCE(pt.booking_count, 0),
    COALESCE(pt.hotel_names, ARRAY[]::text[]),
    pt.first_booking_time,
    CASE
      WHEN d.acknowledged_at IS NOT NULL             THEN 'confirmed'
      WHEN d.read                                    THEN 'opened'
      WHEN d.therapist_id IS NOT NULL                THEN 'sent'
      WHEN log.error_count > 0                       THEN 'failed'
      ELSE 'not_sent'
    END,
    COALESCE(log.send_count, 0),
    log.last_sent_at,
    CASE WHEN d.read THEN d.created_at END,
    d.acknowledged_at,
    log.last_error
  FROM public.therapists th
  LEFT JOIN per_therapist pt ON pt.therapist_id = th.id
  LEFT JOIN digests d        ON d.therapist_id  = th.id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE l.status = 'delivered')::integer AS send_count,
      COUNT(*) FILTER (WHERE l.status <> 'delivered')::integer AS error_count,
      MAX(l.sent_at)                                          AS last_sent_at,
      (array_agg(l.error ORDER BY l.sent_at DESC)
         FILTER (WHERE l.error IS NOT NULL))[1]               AS last_error
    FROM public.push_delivery_logs l
    WHERE l.user_id = th.user_id
      AND l.notification_type = 'digest_d1'
      AND l.sent_at >= (p_target_date - 1)::timestamptz
      AND l.sent_at <  (p_target_date + 1)::timestamptz
  ) log ON TRUE
  -- On ne liste que les thérapeutes concernés : ceux qui travaillent demain, et
  -- ceux à qui une synthèse est déjà partie (pour voir une résa annulée depuis).
  WHERE pt.therapist_id IS NOT NULL OR d.therapist_id IS NOT NULL
  ORDER BY pt.first_booking_time NULLS LAST, th.first_name;
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."admin_tomorrow_digests"(date, "uuid") TO "authenticated", "service_role";

-- Cron horaire : l'edge function ne retient que les fuseaux où il est 19 h local.
-- URL de PRODUCTION (wvderlgzetpptehxndqf). Cette migration est destinée à main ;
-- staging l'a appliquée avec son propre hôte (xfkujlgettlxdgrnqluw).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_cron/pg_net absents — cron ignoré (environnement local)';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-tomorrow-digest-hourly') THEN
    PERFORM cron.unschedule('send-tomorrow-digest-hourly');
  END IF;

  PERFORM cron.schedule(
    'send-tomorrow-digest-hourly',
    '5 * * * *',
    format($sql$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{}'::jsonb
      );
    $sql$, 'https://wvderlgzetpptehxndqf.supabase.co/functions/v1/send-tomorrow-digest')
  );

  RAISE NOTICE 'Cron enregistré : send-tomorrow-digest-hourly (URL prod wvderlgz…)';
END $$;
