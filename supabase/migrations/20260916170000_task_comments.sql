-- =========================================================================
-- Commentaires de tâche — le fil de discussion interne d'une tâche
-- =========================================================================
-- Jusqu'ici, tout ce qui s'échange autour d'une tâche se disait hors de
-- l'outil. Cette table apporte le fil que l'on trouve dans Jira ou Asana :
-- chacun poste un commentaire, répond à un commentaire existant, et mentionne
-- un collègue qui reçoit une notification in-app.
--
-- Première vraie sous-table du module tasks. La checklist (jsonb) et les
-- pièces jointes (text[]) restent des colonnes parce qu'elles n'ont ni auteur
-- ni horodatage propre ; un commentaire en a besoin, tout comme d'un ciblage
-- RLS par auteur (on ne modifie que ses propres mots).
--
-- Profondeur volontairement limitée à un niveau (racine + réponses directes),
-- comme le fil de l'inbox : une conversation d'équipe sur une tâche n'a pas
-- besoin d'un arbre, et un arbre coûte une requête récursive à chaque lecture.
-- La contrainte est portée par un trigger — un CHECK ne peut pas lire une
-- autre ligne.
--
-- Le corps reste du texte lisible — « Peux-tu voir @Marie Dupont ? » — parce
-- que c'est ce que l'auteur a sous les yeux en écrivant ; un jeton technique y
-- serait illisible. Les destinataires ne sont donc pas redéduits du texte à
-- chaque lecture : ils sont résolus une fois à l'écriture et figés dans
-- mentioned_user_ids, qui reste juste même si le collègue est renommé ensuite.
--
-- NOTE : migration écrite à la main, comme 20260915160000 et 20260916140000.
-- `supabase db diff` n'est pas utilisable ici (`supabase/schemas/` est resté
-- pré-multi-tenant et le diff supprimerait cette couche).
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. task_comments — un message du fil, racine ou réponse
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.task_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_comment_id uuid REFERENCES public.task_comments(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  content text NOT NULL,
  mentioned_user_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT chk_task_comments_content
    CHECK (char_length(btrim(content)) > 0)
);

COMMENT ON TABLE public.task_comments IS
  'Fil de discussion interne d''une tâche. Réservé au staff admin : aucun contenu n''est exposé au client, contrairement à channel_messages.';
COMMENT ON COLUMN public.task_comments.organization_id IS
  'Dupliqué depuis la tâche pour que la RLS reste un prédicat hoistable (aucune fonction prenant l''id de la ligne, cf. 20260915100000 et 20260915140000).';
COMMENT ON COLUMN public.task_comments.parent_comment_id IS
  'NULL = commentaire racine. Sinon, réponse directe à une racine — un trigger interdit de répondre à une réponse.';
COMMENT ON COLUMN public.task_comments.author_user_id IS
  'Auteur. Passe à NULL si le compte est supprimé : le commentaire reste dans le fil, affiché sans nom.';
COMMENT ON COLUMN public.task_comments.content IS
  'Corps du message, en texte lisible. Les mentions s''y écrivent « @Prénom Nom » et sont mises en évidence à l''affichage par parseMentions().';
COMMENT ON COLUMN public.task_comments.mentioned_user_ids IS
  'Destinataires résolus à l''écriture — source de vérité des notifications, le texte n''étant pas réanalysé ensuite. Pas de FK : un compte supprimé laisse un id orphelin, ignoré.';
COMMENT ON COLUMN public.task_comments.updated_at IS
  'Égal à created_at tant que le commentaire n''a pas été modifié — c''est l''écart entre les deux qui fait afficher « modifié ».';

-- L'ordre du fil est toujours (tâche, chronologique) : index composite plutôt
-- qu'un index sur task_id seul.
CREATE INDEX IF NOT EXISTS idx_task_comments_task
  ON public.task_comments (task_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_task_comments_parent
  ON public.task_comments (parent_comment_id) WHERE parent_comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_comments_organization
  ON public.task_comments (organization_id);

-- -------------------------------------------------------------------------
-- 2. Invariants du fil — profondeur 1 et cohérence de la tâche
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.task_comments_check_parent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_task_id uuid;
  parent_parent_id uuid;
BEGIN
  IF NEW.parent_comment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT task_id, parent_comment_id
    INTO parent_task_id, parent_parent_id
    FROM public.task_comments
   WHERE id = NEW.parent_comment_id;

  IF parent_task_id IS NULL THEN
    RAISE EXCEPTION 'Commentaire parent introuvable (%)', NEW.parent_comment_id;
  END IF;

  IF parent_parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'Le fil est limité à un niveau : impossible de répondre à une réponse.';
  END IF;

  IF parent_task_id <> NEW.task_id THEN
    RAISE EXCEPTION 'Le commentaire parent appartient à une autre tâche.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.task_comments_check_parent() IS
  'Garantit un fil à un seul niveau et interdit de rattacher une réponse au commentaire d''une autre tâche.';

DROP TRIGGER IF EXISTS trg_task_comments_check_parent ON public.task_comments;
CREATE TRIGGER trg_task_comments_check_parent
  BEFORE INSERT OR UPDATE OF parent_comment_id, task_id ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.task_comments_check_parent();

DROP TRIGGER IF EXISTS update_task_comments_updated_at ON public.task_comments;
CREATE TRIGGER update_task_comments_updated_at
  BEFORE UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -------------------------------------------------------------------------
-- 3. RLS — lecture par l'organisation, écriture par l'auteur
-- -------------------------------------------------------------------------
-- Les tâches sont admin-only (policy unique « Admins manage tasks in their
-- org ») : le fil suit la même règle d'accès. On découpe en revanche par verbe
-- pour qu'un admin ne puisse pas réécrire les mots d'un collègue.
-- Prédicats hoistables uniquement.

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Block anonymous access to task comments" ON public.task_comments;
CREATE POLICY "Block anonymous access to task comments" ON public.task_comments
  AS RESTRICTIVE TO anon USING (false);

DROP POLICY IF EXISTS "Admins read task comments in their org" ON public.task_comments;
CREATE POLICY "Admins read task comments in their org" ON public.task_comments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND (
      public.is_super_admin(auth.uid())
      OR organization_id = public.get_user_organization_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins write task comments in their org" ON public.task_comments;
CREATE POLICY "Admins write task comments in their org" ON public.task_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND author_user_id = auth.uid()
    AND (
      public.is_super_admin(auth.uid())
      OR organization_id = public.get_user_organization_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authors update their task comments" ON public.task_comments;
CREATE POLICY "Authors update their task comments" ON public.task_comments
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND author_user_id = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND author_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Authors or super admins delete task comments" ON public.task_comments;
CREATE POLICY "Authors or super admins delete task comments" ON public.task_comments
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND (
      author_user_id = auth.uid()
      OR public.is_super_admin(auth.uid())
    )
  );

GRANT ALL ON TABLE public.task_comments TO anon;
GRANT ALL ON TABLE public.task_comments TO authenticated;
GRANT ALL ON TABLE public.task_comments TO service_role;
