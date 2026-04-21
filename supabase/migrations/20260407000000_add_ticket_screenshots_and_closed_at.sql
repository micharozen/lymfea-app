-- Add screenshot_urls and closed_at columns to tickets table
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS screenshot_urls TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Trigger function to auto-set closed_at when ticket is resolved or closed
CREATE OR REPLACE FUNCTION public.set_ticket_closed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('resolved', 'closed') AND OLD.status NOT IN ('resolved', 'closed') THEN
    NEW.closed_at := now();
  ELSIF NEW.status NOT IN ('resolved', 'closed') AND OLD.status IN ('resolved', 'closed') THEN
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ticket_closed_at ON public.tickets;
CREATE TRIGGER trg_ticket_closed_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ticket_closed_at();
