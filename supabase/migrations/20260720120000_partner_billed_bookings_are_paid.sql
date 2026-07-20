-- Facturation partenaire : une réservation réglée par un partenaire
-- (Staycation, ClassPass, Sezame) est désormais stockée comme payée.
--
-- Avant : payment_status = 'pending_partner_billing' + payment_method = 'partner_billed'
-- Après : payment_status = 'paid'                    + payment_method = 'partner_billed'
--
-- Motivation : payment_status mélangeait deux dimensions (état du règlement ET
-- canal de règlement), rendant impossible d'exprimer « payée, par un
-- partenaire ». Le canal est déjà porté par payment_method, et le partenaire
-- précis par client_type — 'pending_partner_billing' en était une troisième
-- copie redondante qui occupait la place du statut. Conséquence visible :
-- l'admin affichait « Payé 0 € — Reste 165 € » sur une réservation où le client
-- ne devait plus rien.
--
-- La valeur 'pending_partner_billing' est VOLONTAIREMENT conservée dans le
-- CHECK constraint : le code applicatif sait encore la lire (voir
-- isPartnerBilledBooking / effectivePaymentStatus dans src/lib/clientTypePayment.ts),
-- ce qui garde un rollback possible sans casser les données. Le retrait de la
-- valeur de l'enum fera l'objet d'une seconde migration, une fois ce backfill
-- confirmé en production.
--
-- Note : ce backfill ne suit AUCUN reversement partenaire. Savoir si le
-- partenaire a effectivement reversé les sommes à l'établissement reste hors
-- périmètre (décision produit) ; aucune donnée de ce type n'existait auparavant,
-- 'pending_partner_billing' ne portant que l'intention de facturation.

BEGIN;

UPDATE public.bookings
SET payment_status = 'paid'
WHERE payment_status = 'pending_partner_billing'
  AND payment_method = 'partner_billed';

-- Filet de sécurité : une réservation partenaire dont la méthode aurait été
-- perdue (import, saisie manuelle) resterait invisible du backfill ci-dessus et
-- continuerait d'afficher un reste à payer. On la rattache à son canal.
UPDATE public.bookings
SET payment_method = 'partner_billed',
    payment_status = 'paid'
WHERE payment_status = 'pending_partner_billing'
  AND payment_method IS DISTINCT FROM 'partner_billed'
  AND client_type IN ('staycation', 'classpass', 'sezame');

COMMIT;
