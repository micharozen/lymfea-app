-- Association thérapeute <-> prestation (treatment_menus).
--
-- Remplace à terme therapists.skills (17 spécialités hardcodées matchées contre
-- treatment_menus.treatment_type) par un lien direct vers les prestations.
--
-- Release 1 : la table est créée et alimentée par les admins, mais AUCUN moteur
-- de matching ne la lit encore (reserve_trunk_atomically, get-availability,
-- useAvailableTherapistsForSlot restent sur skills). Bascule en Release 2.

-- Table de jointure pure : PK composite, pas de surrogate id.
-- L'index de PK sert directement le prédicat de matching de la Release 2
-- (WHERE therapist_id = ? AND treatment_menu_id = ANY(...)).
CREATE TABLE IF NOT EXISTS public.therapist_treatments (
    therapist_id uuid NOT NULL,
    treatment_menu_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.therapist_treatments OWNER TO postgres;

ALTER TABLE ONLY public.therapist_treatments
    ADD CONSTRAINT therapist_treatments_pkey PRIMARY KEY (therapist_id, treatment_menu_id);

ALTER TABLE ONLY public.therapist_treatments
    ADD CONSTRAINT therapist_treatments_therapist_id_fkey FOREIGN KEY (therapist_id) REFERENCES public.therapists(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.therapist_treatments
    ADD CONSTRAINT therapist_treatments_treatment_menu_id_fkey FOREIGN KEY (treatment_menu_id) REFERENCES public.treatment_menus(id) ON DELETE CASCADE;

-- La PK couvre déjà (therapist_id, ...) ; cet index sert au sens inverse
-- (« quels thérapeutes réalisent cette prestation »).
CREATE INDEX IF NOT EXISTS idx_therapist_treatments_treatment_menu_id
    ON public.therapist_treatments USING btree (treatment_menu_id);

ALTER TABLE public.therapist_treatments ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.therapist_treatments TO anon;
GRANT ALL ON TABLE public.therapist_treatments TO authenticated;
GRANT ALL ON TABLE public.therapist_treatments TO service_role;

-- Policies : miroir de therapist_venues.
-- Le concierge est en lecture seule sur tout ce périmètre (therapists,
-- therapist_venues, treatment_menus) — on ne lui ouvre pas l'écriture ici.
-- Pas de policy anon : get-availability tourne en service_role et
-- get_public_therapists est SECURITY DEFINER.

CREATE POLICY "Admins can manage therapist treatments" ON public.therapist_treatments
    USING (public.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Concierges can view therapist treatments from their hotels" ON public.therapist_treatments
    FOR SELECT USING (
        public.has_role(auth.uid(), 'concierge'::public.app_role)
        AND treatment_menu_id IN (
            SELECT tm.id FROM public.treatment_menus tm
            WHERE tm.hotel_id IN (
                SELECT hotel_id FROM public.get_concierge_hotels(auth.uid())
            )
        )
    );

CREATE POLICY "Therapists can view their own treatments" ON public.therapist_treatments
    FOR SELECT TO authenticated
    USING (therapist_id = public.get_therapist_id(auth.uid()));
