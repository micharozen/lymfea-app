-- Passage des offres Starter / Pro au forfait mensuel (110 € / 159 €).
--
-- Avant : 149 € / 249 € facturés PAR LIEU (seats = nombre de venues).
-- Après  : forfait mensuel unique, la segmentation reposant sur le volume de
--          réservations et l'intégration PMS (cf. comparatif d'offres v4.1).
--
-- Les Prices Stripe correspondants ont été créés par
-- `scripts/create-billing-prices.ts --apply` (compte live) avant application.
-- L'annuel vaut 10 mois (2 mois offerts).
--
-- Les abonnements en cours ne sont PAS migrés : Stripe les conserve sur leur
-- Price d'origine. Les anciens Prices restent donc actifs et ne sont pas
-- supprimés.
--
-- Le plan 'enterprise' est conservé en base (des organisations y sont encore
-- rattachées) ; il n'est simplement plus proposé sur la landing.
--
-- N.B. Les stripe_price_id_* ci-dessous sont ceux du compte LIVE. Sur un
-- environnement de test, laisser les colonnes à NULL et régénérer via
-- `scripts/seed-billing-plans.ts`, qui resynchronise depuis Stripe.

UPDATE public.plans
SET monthly_amount_cents    = 11000,
    yearly_amount_cents     = 110000,
    stripe_price_id_monthly = 'price_1TvdkJ99TOZ6ycwLUpnzMrIK',
    stripe_price_id_yearly  = 'price_1TvdkJ99TOZ6ycwLNGvURae8',
    updated_at              = now()
WHERE code = 'starter';

UPDATE public.plans
SET monthly_amount_cents    = 15900,
    yearly_amount_cents     = 159000,
    stripe_price_id_monthly = 'price_1TvdkH99TOZ6ycwL203DISwE',
    stripe_price_id_yearly  = 'price_1TvdkI99TOZ6ycwLleSXxHdp',
    updated_at              = now()
WHERE code = 'pro';
