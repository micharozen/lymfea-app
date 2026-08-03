-- Backfill client_type pour les réservations issues du flow client public.
--
-- Jusqu'ici le flow en ligne ne transmettait aucun signal de typologie client :
-- client_type était déduit du mode de paiement ('room' => hotel, sinon defaut
-- DB 'external'), et le chemin carte (Stripe) n'ecrivait meme pas la colonne.
-- Résultat : un résident de l'hôtel qui payait par carte pour ne pas poster le
-- soin sur sa chambre était compté comme client externe dans les KPI (mix
-- clients du dashboard, récap quotidien, facturation venue).
--
-- Un numéro de chambre renseigné sur une réservation faite en ligne signifie
-- que le visiteur a coché « je suis client de l'hôtel » à l'étape GuestInfo :
-- c'est le signal fiable pour rattraper l'historique.
--
-- Le filtre sur 'external' préserve les typologies partenaires
-- (staycation / classpass / sezame), qui ne doivent jamais basculer en 'hotel'.

UPDATE bookings
SET client_type = 'hotel'
WHERE client_type = 'external'
  AND source = 'client'
  AND room_number IS NOT NULL
  AND btrim(room_number) <> '';
