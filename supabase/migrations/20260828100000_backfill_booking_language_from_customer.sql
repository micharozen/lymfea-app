-- Aligne `bookings.language` sur la préférence du client (`customers.language`).
--
-- `bookings.language` naît d'un défaut ('fr' sur les drafts `awaiting_payment`,
-- sinon l'indicatif téléphonique saisi) et un chemin de création pouvait la
-- laisser à cette valeur : des réservations de clients anglophones portaient
-- donc 'fr' (résa #1619). Les envois client passent désormais par
-- `resolveClientLanguage()` (customer d'abord), mais plusieurs fonctions
-- lisent encore la colonne seule — on remet donc les lignes existantes
-- d'équerre.
--
-- Rejouable : la clause `IS DISTINCT FROM` ne laisse rien à faire au 2e passage.

UPDATE bookings b
SET language = c.language
FROM customers c
WHERE c.id = b.customer_id
  AND c.language IN ('fr', 'en')
  AND b.language IS DISTINCT FROM c.language;
