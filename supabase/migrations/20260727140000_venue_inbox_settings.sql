-- Per-venue configuration for the Inbox AI agent (llm-agent / generate-inquiry-reply).
--
-- Why a dedicated table rather than more columns on hotels: `hotels` already carries
-- 55 columns and is fetched on nearly every page. These fields are only read by the
-- inbox edge functions and edited from a single admin tab, so they live apart.
--
-- Everything is nullable: with no row (or an empty one), the agent falls back to its
-- built-in five-star defaults — the behaviour that shipped before this migration.

CREATE TABLE IF NOT EXISTS public.venue_inbox_settings (
  hotel_id text PRIMARY KEY REFERENCES public.hotels(id) ON DELETE CASCADE,
  reply_greeting_fr text,
  reply_greeting_en text,
  reply_signoff_fr text,
  reply_signoff_en text,
  reply_signature text,
  reply_tone_notes text,
  knowledge_base_fr text,
  knowledge_base_en text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.venue_inbox_settings IS
  'Per-venue tone of voice + knowledge base injected into the Inbox AI reply prompt. All fields optional.';
COMMENT ON COLUMN public.venue_inbox_settings.reply_greeting_fr IS
  'Exact opening line the agent must use in French, e.g. "Salutations ensoleillées du Cap d''Antibes Beach Hôtel,". Null → built-in formal salutation.';
COMMENT ON COLUMN public.venue_inbox_settings.reply_signoff_fr IS
  'Exact sign-off the agent must use in French, e.g. "Chaleureusement,". Null → built-in sign-off.';
COMMENT ON COLUMN public.venue_inbox_settings.reply_signature IS
  'Multi-line signature block appended after the sign-off (team name, venue, phone). Language-neutral.';
COMMENT ON COLUMN public.venue_inbox_settings.reply_tone_notes IS
  'Free-form writing instructions appended to the system prompt (register, phrases to avoid, house wording).';
COMMENT ON COLUMN public.venue_inbox_settings.knowledge_base_fr IS
  'Authoritative facts the treatment menu does not carry: packages (beach & self-care day), gift boxes, spa access, hours, house rules. The agent may not state anything beyond it.';

-- Auto-touch updated_at
CREATE OR REPLACE FUNCTION public.venue_inbox_settings_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS venue_inbox_settings_updated_at ON public.venue_inbox_settings;
CREATE TRIGGER venue_inbox_settings_updated_at
  BEFORE UPDATE ON public.venue_inbox_settings
  FOR EACH ROW EXECUTE FUNCTION public.venue_inbox_settings_set_updated_at();

-- RLS: mirrors email_inquiries — admin/concierge read, admin writes, service_role
-- (the edge functions) bypasses RLS.
ALTER TABLE public.venue_inbox_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venue_inbox_settings admin read" ON public.venue_inbox_settings;
CREATE POLICY "venue_inbox_settings admin read" ON public.venue_inbox_settings
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'concierge'::public.app_role)
  );

DROP POLICY IF EXISTS "venue_inbox_settings admin insert" ON public.venue_inbox_settings;
CREATE POLICY "venue_inbox_settings admin insert" ON public.venue_inbox_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "venue_inbox_settings admin update" ON public.venue_inbox_settings;
CREATE POLICY "venue_inbox_settings admin update" ON public.venue_inbox_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
