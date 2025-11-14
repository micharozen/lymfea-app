-- Modifier la table concierges pour supporter plusieurs hôtels
-- D'abord, créer une table de liaison pour la relation many-to-many
CREATE TABLE IF NOT EXISTS public.concierge_hotels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concierge_id uuid NOT NULL REFERENCES public.concierges(id) ON DELETE CASCADE,
  hotel_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(concierge_id, hotel_id)
);

-- Activer RLS sur la nouvelle table
ALTER TABLE public.concierge_hotels ENABLE ROW LEVEL SECURITY;

-- Créer les politiques RLS pour concierge_hotels
CREATE POLICY "Admins can view all concierge hotels"
  ON public.concierge_hotels
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can create concierge hotels"
  ON public.concierge_hotels
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update concierge hotels"
  ON public.concierge_hotels
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete concierge hotels"
  ON public.concierge_hotels
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Migrer les données existantes de concierges vers concierge_hotels
INSERT INTO public.concierge_hotels (concierge_id, hotel_id)
SELECT id, hotel_id
FROM public.concierges
WHERE hotel_id IS NOT NULL;