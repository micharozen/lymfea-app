-- =========================================================================
-- Bons cadeaux revendeurs externes (Wonderbox, Smartbox, Groupon…)
-- =========================================================================
-- Un bon revendeur est un avoir en euros, exactement comme une carte cadeau
-- `gift_amount` vendue par Saoma. Il est donc porté par la table existante
-- `customer_treatment_bundles`, discriminée par un nouvel axe `origin` :
--
--   origin = 'internal'  → cure ou carte cadeau Saoma (invariants inchangés)
--   origin = 'external'  → bon revendeur : ni template catalogue, ni acheteur
--
-- Ce choix conserve tel quel `use_gift_amount`, l'audit `bundle_amount_usages`,
-- la restitution du solde à l'annulation / au no-show, et `expire_overdue_bundles`.
--
-- NOTE : migration écrite à la main volontairement. `supabase db diff` n'est pas
-- utilisable ici car `supabase/schemas/` est resté dans un état pré-multi-tenant
-- (table `organizations`, `hotels.organization_id`, policies org-scoped absentes)
-- et le diff généré supprimerait cette couche.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. voucher_resellers — catalogue des revendeurs, partagé par organisation
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.voucher_resellers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  default_validity_months integer,
  sender_email_domain text,
  code_pattern text,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT chk_vr_validity CHECK (default_validity_months IS NULL OR default_validity_months > 0)
);

COMMENT ON TABLE public.voucher_resellers IS
  'Revendeurs externes de bons cadeaux (Wonderbox, Smartbox…), partagés par toute une organisation.';
COMMENT ON COLUMN public.voucher_resellers.slug IS
  'Clé stable (wonderbox, smartbox) — servira au routage de la future ingestion email.';
COMMENT ON COLUMN public.voucher_resellers.default_validity_months IS
  'Pré-remplit expires_at lors de la saisie manuelle d''un bon. NULL = à saisir à la main.';
COMMENT ON COLUMN public.voucher_resellers.sender_email_domain IS
  'Domaine expéditeur du revendeur — clé de routage de la future ingestion email.';
COMMENT ON COLUMN public.voucher_resellers.code_pattern IS
  'Regex optionnelle du format de code. Avertissement à la saisie, jamais bloquant.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_voucher_resellers_org_slug
  ON public.voucher_resellers (organization_id, slug);
CREATE INDEX IF NOT EXISTS idx_voucher_resellers_org_active
  ON public.voucher_resellers (organization_id) WHERE is_active;

ALTER TABLE public.voucher_resellers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Block anonymous access to voucher resellers" ON public.voucher_resellers
  AS RESTRICTIVE TO anon USING (false);

CREATE POLICY "Admins can manage voucher resellers" ON public.voucher_resellers
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Concierges can view voucher resellers" ON public.voucher_resellers
  FOR SELECT USING (public.has_role(auth.uid(), 'concierge'::public.app_role));

CREATE POLICY "Concierges can insert voucher resellers" ON public.voucher_resellers
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'concierge'::public.app_role));

GRANT ALL ON TABLE public.voucher_resellers TO anon, authenticated, service_role;

-- Socle commun : seuls le nom et le slug sont seedés. La durée de validité et le
-- domaine expéditeur varient selon les contrats et restent à renseigner par le
-- lieu — les pré-remplir au jugé produirait de mauvaises dates d'expiration.
INSERT INTO public.voucher_resellers (organization_id, name, slug)
SELECT o.id, v.name, v.slug
FROM public.organizations o
CROSS JOIN (VALUES
  ('Wonderbox', 'wonderbox'),
  ('Smartbox',  'smartbox'),
  ('Groupon',   'groupon')
) AS v(name, slug)
ON CONFLICT (organization_id, slug) DO NOTHING;

-- -------------------------------------------------------------------------
-- 2. customer_treatment_bundles — l'axe origin
-- -------------------------------------------------------------------------

-- Un bon revendeur n'a ni template catalogue ni acheteur identifié chez nous.
ALTER TABLE public.customer_treatment_bundles ALTER COLUMN bundle_id   DROP NOT NULL;
ALTER TABLE public.customer_treatment_bundles ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE public.customer_treatment_bundles
  ADD COLUMN IF NOT EXISTS origin text DEFAULT 'internal' NOT NULL,
  ADD COLUMN IF NOT EXISTS reseller_id uuid REFERENCES public.voucher_resellers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_code text,
  ADD COLUMN IF NOT EXISTS external_code_normalized text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual' NOT NULL,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb,
  ADD COLUMN IF NOT EXISTS source_message_id text,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid;

COMMENT ON COLUMN public.customer_treatment_bundles.origin IS
  'internal = cure ou carte cadeau vendue par le lieu ; external = bon acheté chez un revendeur tiers';
COMMENT ON COLUMN public.customer_treatment_bundles.external_code IS
  'Référence du bon revendeur, telle que reçue. Distincte de redemption_code (généré par Saoma, 10 car.).';
COMMENT ON COLUMN public.customer_treatment_bundles.external_code_normalized IS
  'external_code en majuscules, sans caractère non alphanumérique. Clé de recherche.';
COMMENT ON COLUMN public.customer_treatment_bundles.source IS
  'Comment le bon est entré dans Saoma : saisie manuelle, import email, ou API partenaire.';
COMMENT ON COLUMN public.customer_treatment_bundles.source_message_id IS
  'Message-Id du mail revendeur — clé d''idempotence de la future ingestion email.';

ALTER TABLE public.customer_treatment_bundles
  DROP CONSTRAINT IF EXISTS chk_ctb_origin;
ALTER TABLE public.customer_treatment_bundles
  ADD CONSTRAINT chk_ctb_origin CHECK (origin IN ('internal', 'external'));

ALTER TABLE public.customer_treatment_bundles
  DROP CONSTRAINT IF EXISTS chk_ctb_source;
ALTER TABLE public.customer_treatment_bundles
  ADD CONSTRAINT chk_ctb_source CHECK (source IN ('manual', 'email_import', 'api'));

-- Chaque origine a sa forme. Le volet 'internal' re-verrouille exactement les
-- invariants que les DROP NOT NULL ci-dessus viennent de relâcher : une cure ou
-- une carte cadeau Saoma reste impossible sans template ni client.
ALTER TABLE public.customer_treatment_bundles
  DROP CONSTRAINT IF EXISTS chk_ctb_origin_shape;
ALTER TABLE public.customer_treatment_bundles
  ADD CONSTRAINT chk_ctb_origin_shape CHECK (
    (origin = 'internal'
       AND bundle_id IS NOT NULL
       AND customer_id IS NOT NULL
       AND external_code IS NULL
       AND reseller_id IS NULL)
    OR
    (origin = 'external'
       AND external_code IS NOT NULL
       AND external_code_normalized IS NOT NULL
       AND total_amount_cents IS NOT NULL
       AND is_gift = false)
  );

-- Unicité par lieu, et non globale : deux revendeurs peuvent émettre le même code.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ctb_external_code
  ON public.customer_treatment_bundles (hotel_id, external_code_normalized)
  WHERE external_code_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ctb_external_active
  ON public.customer_treatment_bundles (hotel_id, status) WHERE origin = 'external';

CREATE UNIQUE INDEX IF NOT EXISTS uq_ctb_source_message
  ON public.customer_treatment_bundles (source_message_id)
  WHERE source_message_id IS NOT NULL;

-- -------------------------------------------------------------------------
-- 3. voucher_verification_requests — file des bons à vérifier
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.voucher_verification_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  hotel_id text NOT NULL REFERENCES public.hotels(id),
  submitted_code text NOT NULL,
  submitted_code_normalized text NOT NULL,
  claimed_reseller_id uuid REFERENCES public.voucher_resellers(id) ON DELETE SET NULL,
  booking_total_cents integer NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  resolved_bundle_id uuid REFERENCES public.customer_treatment_bundles(id),
  approved_amount_cents integer,
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT chk_vvr_status CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  CONSTRAINT chk_vvr_total_positive CHECK (booking_total_cents >= 0),
  CONSTRAINT chk_vvr_resolution CHECK (
    status = 'pending'
    OR (status = 'approved' AND reviewed_at IS NOT NULL AND approved_amount_cents IS NOT NULL)
    OR (status IN ('rejected', 'cancelled') AND reviewed_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.voucher_verification_requests IS
  'File des références de bons saisies par un client mais introuvables en base : le lieu vérifie et tranche.';
COMMENT ON COLUMN public.voucher_verification_requests.booking_total_cents IS
  'Total de la réservation figé au moment de la demande, pour que la validation ne dépende pas d''un prix modifié depuis.';

-- Une seule demande en attente par réservation : neutralise le double envoi.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vvr_pending_per_booking
  ON public.voucher_verification_requests (booking_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_vvr_hotel_pending
  ON public.voucher_verification_requests (hotel_id, created_at DESC) WHERE status = 'pending';

ALTER TABLE public.voucher_verification_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Block anonymous access to voucher verifications" ON public.voucher_verification_requests
  AS RESTRICTIVE TO anon USING (false);

CREATE POLICY "Admins can manage voucher verifications" ON public.voucher_verification_requests
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Concierges can view voucher verifications" ON public.voucher_verification_requests
  FOR SELECT USING (public.has_role(auth.uid(), 'concierge'::public.app_role));

GRANT ALL ON TABLE public.voucher_verification_requests TO anon, authenticated, service_role;

-- -------------------------------------------------------------------------
-- 4. bookings — nouveau mode de paiement et statut « bon à vérifier »
-- -------------------------------------------------------------------------

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS external_voucher_reference text;

COMMENT ON COLUMN public.bookings.external_voucher_reference IS
  'Référence du bon revendeur telle que saisie par le client, y compris lorsqu''elle est introuvable.';

COMMENT ON COLUMN public.bookings.gift_amount_applied_cents IS
  'Portion de la réservation couverte par un avoir — carte cadeau Saoma ou bon revendeur externe.';

-- NOT VALID puis VALIDATE : évite un full scan sous ACCESS EXCLUSIVE sur une
-- table volumineuse. La revalidation échouerait si des lignes violaient déjà la
-- contrainte précédente ; on la lance donc explicitement pour le constater.
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_method_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_method_check
  CHECK (payment_method = ANY (ARRAY[
    'room'::text, 'card'::text, 'card_on_site'::text, 'offert'::text,
    'gift_amount'::text, 'voucher'::text, 'partner_billed'::text,
    'cash'::text, 'cure_fresha'::text, 'external_voucher'::text
  ])) NOT VALID;
ALTER TABLE public.bookings VALIDATE CONSTRAINT bookings_payment_method_check;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status = ANY (ARRAY[
    'pending'::text, 'awaiting_payment'::text, 'paid'::text, 'failed'::text,
    'refunded'::text, 'charged'::text, 'charged_to_room'::text, 'card_saved'::text,
    'expired'::text, 'pending_partner_billing'::text, 'pending_room_charge'::text,
    'offert'::text, 'pending_voucher_check'::text
  ])) NOT VALID;
ALTER TABLE public.bookings VALIDATE CONSTRAINT bookings_payment_status_check;

CREATE INDEX IF NOT EXISTS idx_bookings_pending_voucher_check
  ON public.bookings (hotel_id, created_at DESC)
  WHERE payment_status = 'pending_voucher_check';
