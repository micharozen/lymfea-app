-- Demandes entrantes : `tasks` devient le pipeline de traitement unique, et
-- `email_inquiries` devient `channel_messages`, couche transport omnicanale.
--
-- Jusqu'ici deux pipelines couvraient le même besoin : l'Inbox email
-- (email_inquiries, parsée par le LLM) et les tâches admin, utilisées de fait
-- comme demandes entrantes pour les canaux sans messagerie (appel, walk-in).
-- On sépare désormais le transport (le message, son fil, son parsing) du
-- traitement (qui s'en occupe, où ça en est, conversion en réservation) :
--   channel_messages.task_id  →  une tâche porte N messages.
-- Le `status` d'un message redevient purement technique ; l'état de travail
-- vit sur la tâche.

-- ---------------------------------------------------------------------------
-- 1. tasks : demande entrante, prospect sans fiche client, conversion
-- ---------------------------------------------------------------------------

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS client_type          text,
  ADD COLUMN IF NOT EXISTS channel              text,
  ADD COLUMN IF NOT EXISTS feedback_type        text,
  ADD COLUMN IF NOT EXISTS treatment_date       date,
  ADD COLUMN IF NOT EXISTS prospect_first_name  text,
  ADD COLUMN IF NOT EXISTS prospect_last_name   text,
  ADD COLUMN IF NOT EXISTS prospect_email       text,
  ADD COLUMN IF NOT EXISTS prospect_phone       text,
  ADD COLUMN IF NOT EXISTS converted_booking_id uuid
    REFERENCES public.bookings(id) ON DELETE SET NULL;

-- Même domaine que bookings.client_type : la valeur est reprise telle quelle
-- à la conversion, aucune traduction ne doit s'intercaler.
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_client_type_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_client_type_check
  CHECK (client_type IS NULL OR client_type IN
    ('hotel', 'staycation', 'classpass', 'sezame', 'external'));

-- Canal d'arrivée de la demande. Volontairement distinct de bookings.source :
-- les deux domaines ne se recouvrent pas (source décrit qui a saisi la
-- réservation, channel par où le client a écrit). Le mapping est explicite
-- côté application.
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_channel_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_channel_check
  CHECK (channel IS NULL OR channel IN
    ('website', 'email', 'phone', 'whatsapp', 'instagram', 'walk_in', 'partner', 'other'));

-- Type de retour attendu, repris du flux Asana qu'Eïa remplace. Sert d'état
-- de suivi commercial sans ajouter de colonne au kanban.
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_feedback_type_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_feedback_type_check
  CHECK (feedback_type IS NULL OR feedback_type IN
    ('validation_received', 'issue_reported', 'change_requested', 'awaiting_client',
     'awaiting_partner', 'need_more_info', 'internal_feedback', 'awaiting_payment'));

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_task_type_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_task_type_check
  CHECK (task_type IN ('booking_followup', 'payment_followup', 'gift_followup',
                       'loyalty', 'bug', 'inbound_request', 'other'));

COMMENT ON COLUMN public.tasks.treatment_date IS
  'Date du soin demandé — distincte de due_date, qui est l''échéance de traitement de la tâche.';
COMMENT ON COLUMN public.tasks.prospect_phone IS
  'Coordonnées saisies avant qu''une fiche client n''existe. La fiche customers n''est résolue ou créée qu''à la conversion, par find_or_create_customer.';
COMMENT ON COLUMN public.tasks.converted_booking_id IS
  'Réservation issue de cette demande. Non nul = conversion déjà faite, non rejouable.';

CREATE INDEX IF NOT EXISTS idx_tasks_treatment_date
  ON public.tasks (treatment_date) WHERE treatment_date IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. email_inquiries → channel_messages
-- ---------------------------------------------------------------------------
-- RENAME préserve données, index, contraintes, triggers et policies : rien
-- n'est recréé, donc rien n'est perdu. Seuls les noms sont réalignés.

ALTER TABLE public.email_inquiries RENAME TO channel_messages;

ALTER TABLE public.channel_messages RENAME COLUMN from_address      TO from_identifier;
ALTER TABLE public.channel_messages RENAME COLUMN to_address        TO to_identifier;
ALTER TABLE public.channel_messages RENAME COLUMN message_id        TO external_message_id;
ALTER TABLE public.channel_messages RENAME COLUMN parent_inquiry_id TO parent_message_id;

ALTER TABLE public.bookings RENAME COLUMN email_inquiry_id TO channel_message_id;

ALTER TABLE public.channel_messages
  ADD COLUMN IF NOT EXISTS channel     text NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS task_id     uuid REFERENCES public.tasks(id)     ON DELETE SET NULL;

-- Le DEFAULT requalifie tout l'historique en 'email' sans backfill explicite.
ALTER TABLE public.channel_messages DROP CONSTRAINT IF EXISTS channel_messages_channel_check;
ALTER TABLE public.channel_messages ADD CONSTRAINT channel_messages_channel_check
  CHECK (channel IN ('email', 'sms', 'whatsapp', 'instagram', 'web_form'));

COMMENT ON TABLE public.channel_messages IS
  'Messages entrants et sortants, tous canaux confondus. Couche transport : le fil (parent_message_id + direction), le parsing et la réponse. Le suivi du travail vit sur tasks.';
COMMENT ON COLUMN public.channel_messages.from_identifier IS
  'Émetteur : adresse email, numéro E.164 ou identifiant de compte selon le canal.';
COMMENT ON COLUMN public.channel_messages.to_identifier IS
  'Destinataire, même format que from_identifier.';
COMMENT ON COLUMN public.channel_messages.external_message_id IS
  'Identifiant chez le fournisseur : Message-ID email, wamid WhatsApp…';
COMMENT ON COLUMN public.channel_messages.task_id IS
  'Tâche qui traite ce fil. Toutes les réponses d''un fil partagent le task_id de leur racine.';
COMMENT ON COLUMN public.bookings.channel_message_id IS
  'Message entrant (channel_messages) à l''origine de cette réservation, tous canaux confondus.';
COMMENT ON COLUMN public.channel_messages.status IS
  'État technique du message : received → parsed | replied | failed. L''état de travail (à faire / en cours / terminé) vit sur tasks.status.';

CREATE INDEX IF NOT EXISTS channel_messages_task_idx
  ON public.channel_messages (task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS channel_messages_customer_idx
  ON public.channel_messages (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS channel_messages_channel_idx
  ON public.channel_messages (channel);

-- ---------------------------------------------------------------------------
-- 3. Réalignement des noms hérités (index, contraintes, trigger, policies)
-- ---------------------------------------------------------------------------

ALTER INDEX IF EXISTS email_inquiries_pkey           RENAME TO channel_messages_pkey;
ALTER INDEX IF EXISTS email_inquiries_hotel_id_idx   RENAME TO channel_messages_hotel_id_idx;
ALTER INDEX IF EXISTS email_inquiries_status_idx     RENAME TO channel_messages_status_idx;
ALTER INDEX IF EXISTS email_inquiries_booking_id_idx RENAME TO channel_messages_booking_id_idx;
ALTER INDEX IF EXISTS email_inquiries_parent_idx     RENAME TO channel_messages_parent_idx;
ALTER INDEX IF EXISTS email_inquiries_direction_idx  RENAME TO channel_messages_direction_idx;

ALTER TRIGGER email_inquiries_updated_at ON public.channel_messages
  RENAME TO channel_messages_updated_at;
ALTER FUNCTION public.email_inquiries_set_updated_at()
  RENAME TO channel_messages_set_updated_at;

ALTER POLICY "email_inquiries admin read"   ON public.channel_messages
  RENAME TO "channel_messages admin read";
ALTER POLICY "email_inquiries admin update" ON public.channel_messages
  RENAME TO "channel_messages admin update";

-- CHECK et FK héritées : les noms sont réalignés en bloc, en tolérant qu'une
-- contrainte manque (l'historique de staging dérive de celui du repo).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname,
           replace(
             replace(conname, 'email_inquiries_', 'channel_messages_'),
             'parent_inquiry_id', 'parent_message_id'
           ) AS newname,
           'public.channel_messages'::regclass AS tbl
    FROM pg_constraint
    WHERE conrelid = 'public.channel_messages'::regclass
      AND conname LIKE 'email_inquiries_%'
    UNION ALL
    SELECT conname,
           replace(conname, 'email_inquiry_id', 'channel_message_id') AS newname,
           'public.bookings'::regclass AS tbl
    FROM pg_constraint
    WHERE conrelid = 'public.bookings'::regclass
      AND conname LIKE '%email_inquiry_id%'
  LOOP
    EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I', r.tbl, r.conname, r.newname);
  END LOOP;
END $$;
