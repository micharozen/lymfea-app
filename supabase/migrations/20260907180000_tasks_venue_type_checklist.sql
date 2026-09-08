-- =========================================================================
-- Tâches : type de tâche, soins/thérapeutes concernés et checklist
--
-- Contexte : reprise du flux Asana d'un client. Une tâche naît quand il
-- manque une information sur une réservation (lieu, soin, thérapeute) ou
-- qu'il faut suivre un paiement / une action précise. Les colonnes Asana
-- deviennent un `task_type`, et « l'action à réaliser » une checklist.
--
-- Aucune table de jointure : soins et thérapeutes sont des tableaux d'ids,
-- la checklist un tableau jsonb. Ces valeurs sont toujours lues et écrites
-- en bloc avec la tâche, jamais requêtées séparément.
-- =========================================================================

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS task_type text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS task_type_other text,
  ADD COLUMN IF NOT EXISTS treatment_menu_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS therapist_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attachments text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_task_type_check;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_task_type_check CHECK (
    task_type IN (
      'booking_followup',
      'payment_followup',
      'gift_followup',
      'loyalty',
      'bug',
      'other'
    )
  );

COMMENT ON COLUMN public.tasks.task_type IS
  'Type de tâche (ex-colonnes Asana). Valeur libre saisie dans task_type_other quand task_type = ''other''.';
COMMENT ON COLUMN public.tasks.task_type_other IS
  'Libellé libre du type, renseigné uniquement quand task_type = ''other''.';
COMMENT ON COLUMN public.tasks.treatment_menu_ids IS
  'Soins concernés (ids treatment_menus). Pas de FK : un soin supprimé laisse un id orphelin, ignoré à l''affichage.';
COMMENT ON COLUMN public.tasks.therapist_ids IS
  'Thérapeutes concernés (ids hairdressers). Pas de FK : un thérapeute supprimé laisse un id orphelin, ignoré à l''affichage.';
COMMENT ON COLUMN public.tasks.checklist IS
  'Sous-tâches cochables : tableau d''objets { id, label, done }, écrit en bloc avec la tâche.';
COMMENT ON COLUMN public.tasks.attachments IS
  'Captures d''écran jointes : chemins dans le bucket privé task-attachments (pas des URLs, elles sont signées à l''affichage).';
COMMENT ON COLUMN public.tasks.hotel_id IS
  'Lieu de la tâche. Reste NULLABLE pour les tâches créées avant cette migration, mais obligatoire côté application.';

-- Le lieu devient une dimension de filtre du board : index manquant jusqu'ici.
CREATE INDEX IF NOT EXISTS idx_tasks_hotel
  ON public.tasks (hotel_id)
  WHERE hotel_id IS NOT NULL;

-- -------------------------------------------------------------------------
-- Bucket des captures d'écran — PRIVÉ, contrairement à `avatars` : une capture
-- de tâche montre souvent une réservation ou un échange client. La lecture
-- passe par des URLs signées, et seuls les admins (seuls porteurs des tâches)
-- y accèdent.
-- -------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('task-attachments', 'task-attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins can upload task attachments" ON storage.objects;
CREATE POLICY "Admins can upload task attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'task-attachments'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Admins can read task attachments" ON storage.objects;
CREATE POLICY "Admins can read task attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Admins can delete task attachments" ON storage.objects;
CREATE POLICY "Admins can delete task attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);
