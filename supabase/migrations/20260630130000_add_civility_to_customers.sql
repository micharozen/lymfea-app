-- Add civility (title) to customers for personalised greetings in emails/SMS.
--
-- Context: the admin/concierge booking form collects the client's civility
-- ('madame' | 'monsieur') so confirmation/pending/payment communications can be
-- addressed "Madame {Nom}" / "Mrs {Nom}" instead of a generic greeting. Stored on
-- the customer record only (not denormalised on bookings).
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS civility TEXT
  CHECK (civility IN ('madame', 'monsieur'));
