-- =========================================================================
-- Admin Task Management
-- =========================================================================
-- Adds a `tasks` table so admins can track operational work (call a client,
-- prepare a room, chase a payment…) on a Kanban board, optionally linked to a
-- booking and/or a customer, and assigned to an admin who gets an in-app
-- notification. Scoped by organization (multi-tenancy) via the existing
-- is_super_admin / get_user_organization_id helpers.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. tasks table
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tasks (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  hotel_id             text REFERENCES public.hotels(id) ON DELETE SET NULL,
  booking_id           uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  customer_id          uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  assigned_to_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  title        text NOT NULL,
  description  text,
  status       text NOT NULL DEFAULT 'todo'   CHECK (status   IN ('todo', 'in_progress', 'done')),
  priority     text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date     date,
  position     double precision NOT NULL DEFAULT 0,

  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_tasks_organization ON public.tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status       ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to  ON public.tasks(assigned_to_user_id) WHERE assigned_to_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_booking      ON public.tasks(booking_id)  WHERE booking_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_customer     ON public.tasks(customer_id) WHERE customer_id IS NOT NULL;

GRANT ALL ON TABLE public.tasks TO anon, authenticated, service_role;

-- -------------------------------------------------------------------------
-- 2. RLS — admins manage tasks within their organization (super-admins: all)
-- -------------------------------------------------------------------------

CREATE POLICY "Block anonymous access to tasks" ON public.tasks
  AS RESTRICTIVE TO anon USING (false);

CREATE POLICY "Admins manage tasks in their org" ON public.tasks
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND (
      public.is_super_admin(auth.uid())
      OR organization_id = public.get_user_organization_id(auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND (
      public.is_super_admin(auth.uid())
      OR organization_id = public.get_user_organization_id(auth.uid())
    )
  );

-- -------------------------------------------------------------------------
-- 3. notifications.task_id — let the bell deep-link to a task
-- -------------------------------------------------------------------------

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE;

-- -------------------------------------------------------------------------
-- 4. Realtime — keep the Kanban board in sync across admin sessions
-- -------------------------------------------------------------------------

ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
