-- =========================================================================
-- Une réservation et sa fiche client appartiennent à la même organisation
-- =========================================================================
-- `customers` est cloisonnée par organisation, et `bookings` l'est par le lieu
-- réservé — mais rien ne reliait les deux. Une réservation pouvait donc
-- pointer vers la fiche d'une autre organisation, ce qui casse le modèle en
-- silence : l'équipe du lieu voit la réservation (cloisonnée par `hotel_id`)
-- mais pas la fiche du client (cloisonnée par `organization_id`). Résultat, un
-- client fantôme — nom et téléphone introuvables sur la réservation.
--
-- Deux chemins y menaient : rattacher une fiche existante à une réservation
-- d'un autre établissement, et déplacer une réservation vers un lieu d'une
-- autre organisation (l'édition d'une réservation permet de changer de lieu).
--
-- La bonne réponse n'est pas de rattacher la fiche d'une organisation à une
-- réservation d'une autre : c'est de résoudre la fiche du client dans
-- l'organisation du lieu (`find_or_create_customer` le fait déjà, à partir du
-- téléphone). L'incohérence est donc refusée, pas réparée en silence.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.enforce_customer_same_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _hotel_org uuid;
  _customer_org uuid;
  _customer_id uuid;
BEGIN
  -- La colonne portant la fiche client diffère selon la table : les cures ont
  -- aussi un bénéficiaire, vérifié par un second passage du trigger.
  _customer_id := COALESCE(NEW.customer_id, NULL);

  IF TG_ARGV[0] IS NOT NULL AND TG_ARGV[0] = 'beneficiary' THEN
    _customer_id := NEW.beneficiary_customer_id;
  END IF;

  IF _customer_id IS NULL OR NEW.hotel_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT organization_id INTO _hotel_org FROM public.hotels WHERE id = NEW.hotel_id;
  SELECT organization_id INTO _customer_org FROM public.customers WHERE id = _customer_id;

  IF _hotel_org IS NOT NULL
     AND _customer_org IS NOT NULL
     AND _hotel_org <> _customer_org THEN
    RAISE EXCEPTION
      'La fiche client appartient à une autre organisation que le lieu (% ≠ %). Résolvez la fiche du client dans l''organisation du lieu (find_or_create_customer) au lieu de rattacher celle d''une autre.',
      _customer_org, _hotel_org
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_customer_same_organization() IS
  'Garde-fou d''intégrité : interdit qu''une réservation, une commodité ou une cure relie un lieu et une fiche client de deux organisations différentes.';

DROP TRIGGER IF EXISTS bookings_customer_same_organization ON public.bookings;
CREATE TRIGGER bookings_customer_same_organization
  BEFORE INSERT OR UPDATE OF customer_id, hotel_id ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_customer_same_organization();

DROP TRIGGER IF EXISTS amenity_bookings_customer_same_organization ON public.amenity_bookings;
CREATE TRIGGER amenity_bookings_customer_same_organization
  BEFORE INSERT OR UPDATE OF customer_id, hotel_id ON public.amenity_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_customer_same_organization();

DROP TRIGGER IF EXISTS customer_bundles_customer_same_organization ON public.customer_treatment_bundles;
CREATE TRIGGER customer_bundles_customer_same_organization
  BEFORE INSERT OR UPDATE OF customer_id, hotel_id ON public.customer_treatment_bundles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_customer_same_organization();

-- Le bénéficiaire d'une cure ou d'une carte cadeau est une seconde fiche
-- client : même règle.
DROP TRIGGER IF EXISTS customer_bundles_beneficiary_same_organization ON public.customer_treatment_bundles;
CREATE TRIGGER customer_bundles_beneficiary_same_organization
  BEFORE INSERT OR UPDATE OF beneficiary_customer_id, hotel_id ON public.customer_treatment_bundles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_customer_same_organization('beneficiary');
