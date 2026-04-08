-- Support tickets table
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('question', 'billing', 'booking', 'problem', 'other')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  creator_name TEXT,
  creator_role TEXT,
  notion_page_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Users can see their own tickets
CREATE POLICY "users_select_own_tickets" ON public.tickets
  FOR SELECT USING (created_by = auth.uid());

-- Admins can see all tickets
CREATE POLICY "admins_select_all_tickets" ON public.tickets
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Any authenticated user can create tickets
CREATE POLICY "authenticated_insert_tickets" ON public.tickets
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Admins can update tickets (status changes)
CREATE POLICY "admins_update_tickets" ON public.tickets
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE INDEX idx_tickets_created_at ON public.tickets(created_at DESC);
CREATE INDEX idx_tickets_status ON public.tickets(status);
CREATE INDEX idx_tickets_created_by ON public.tickets(created_by);
