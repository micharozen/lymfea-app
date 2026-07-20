-- Supprime la surcharge orpheline de reserve_trunk_atomically.
--
-- 20260715130000 (treatments as amenities) a ajouté le paramètre _amenity_timing.
-- Ajouter un paramètre change la signature : CREATE OR REPLACE a donc créé une
-- SECONDE fonction au lieu de remplacer la première. Toutes les migrations
-- antérieures qui touchaient à la signature droppaient d'abord l'ensemble des
-- surcharges (cf. 20260429100000) ; ce préambule a été oublié.
--
-- Résultat en base : deux fonctions coexistent.
--   - 22 args (avec _amenity_timing) : version courante, amenity-aware
--   - 21 args                        : figée dans la logique PRÉ-amenities
--
-- PostgREST résout la surcharge d'après les clés envoyées par l'appelant. Les
-- points d'appel qui ne passent pas _amenity_timing tombent donc sur la version
-- périmée, qui ignore la capacité des amenities et n'insère aucune ligne
-- amenity_bookings :
--   - stripe-payment/actions/createCheckoutSession.ts
--   - stripe-payment/actions/confirmSetupIntent.ts (chemin de reprise)
--   - create-draft-booking/index.ts
--
-- On drop toute surcharge dépourvue de _amenity_timing. La version à 22 args
-- reste en place, inchangée : les appelants ci-dessus, qui s'appuient sur les
-- valeurs par défaut, y sont désormais routés.

DO $$
DECLARE _s text;
BEGIN
  FOR _s IN (
    SELECT 'DROP FUNCTION public.reserve_trunk_atomically(' || pg_get_function_identity_arguments(oid) || ');'
    FROM pg_proc
    WHERE proname = 'reserve_trunk_atomically'
      AND pronamespace = 'public'::regnamespace
      AND NOT ('_amenity_timing' = ANY (COALESCE(proargnames, ARRAY[]::text[])))
  ) LOOP
    RAISE NOTICE 'Suppression de la surcharge périmée : %', _s;
    EXECUTE _s;
  END LOOP;
END $$;

-- Garde-fou : à partir d'ici, une seule définition doit subsister.
DO $$
DECLARE _n integer;
BEGIN
  SELECT count(*) INTO _n
  FROM pg_proc
  WHERE proname = 'reserve_trunk_atomically' AND pronamespace = 'public'::regnamespace;

  IF _n <> 1 THEN
    RAISE EXCEPTION 'reserve_trunk_atomically : % définition(s) après nettoyage, 1 attendue', _n;
  END IF;
END $$;
