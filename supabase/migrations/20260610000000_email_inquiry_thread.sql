-- Thread support for email_inquiries: outbound replies + parent linkage.
-- A reply sent by an admin to an inbound inquiry is stored as a sibling row
-- with direction='outbound' and parent_inquiry_id pointing to the root.
-- The full conversation is reconstructed via:
--   SELECT * FROM email_inquiries WHERE id = $root OR parent_inquiry_id = $root
--   ORDER BY created_at ASC

ALTER TABLE public.email_inquiries
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'inbound',
  ADD COLUMN IF NOT EXISTS parent_inquiry_id uuid REFERENCES public.email_inquiries(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_reply_at timestamptz;

ALTER TABLE public.email_inquiries
  DROP CONSTRAINT IF EXISTS email_inquiries_direction_check;
ALTER TABLE public.email_inquiries
  ADD CONSTRAINT email_inquiries_direction_check
    CHECK (direction IN ('inbound', 'outbound'));

-- Extend lifecycle:
--   'sent'    — outbound row, our reply was delivered to Resend
--   'replied' — set on the inbound root once at least one outbound reply was sent
--               (non-terminal: the inquiry can still be converted to a booking later)
ALTER TABLE public.email_inquiries
  DROP CONSTRAINT IF EXISTS email_inquiries_status_check;
ALTER TABLE public.email_inquiries
  ADD CONSTRAINT email_inquiries_status_check
    CHECK (status IN ('received', 'parsed', 'converted', 'dismissed', 'failed', 'sent', 'replied'));

COMMENT ON COLUMN public.email_inquiries.direction IS
  'inbound = received from outside; outbound = reply sent by an admin via send-inquiry-reply.';
COMMENT ON COLUMN public.email_inquiries.parent_inquiry_id IS
  'For outbound rows: id of the inbound root they reply to. Null for roots.';
COMMENT ON COLUMN public.email_inquiries.sent_by IS
  'Admin user who sent the outbound reply. Null for inbound rows.';
COMMENT ON COLUMN public.email_inquiries.last_reply_at IS
  'Updated on the root each time an outbound reply is sent. Used to sort the inbox.';
COMMENT ON COLUMN public.email_inquiries.status IS
  'Lifecycle: received → parsed → converted | dismissed | failed | replied (root with ≥1 outbound) | sent (outbound row).';

CREATE INDEX IF NOT EXISTS email_inquiries_parent_idx
  ON public.email_inquiries (parent_inquiry_id);
CREATE INDEX IF NOT EXISTS email_inquiries_direction_idx
  ON public.email_inquiries (direction);

-- RLS: existing SELECT policy covers all rows (admins read everything). UPDATE
-- policy covers status transitions. INSERTS still go through service_role only
-- (inbound-email-webhook + send-inquiry-reply), so no INSERT policy needed.
