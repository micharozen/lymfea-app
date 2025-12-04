-- Phase 1: Architecture Base de Données pour le système financier OOM

-- 1.1 Ajouter country_code à hotels (avec défaut 'FR')
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT 'FR';

-- 1.2 Mettre à jour les valeurs par défaut des commissions pour éviter les multiplications par zéro
-- hotel_commission par défaut à 10%
ALTER TABLE hotels ALTER COLUMN hotel_commission SET DEFAULT 10.00;
-- hairdresser_commission par défaut à 70%
ALTER TABLE hotels ALTER COLUMN hairdresser_commission SET DEFAULT 70.00;

-- Mettre à jour les hôtels existants avec des commissions à 0 pour avoir des valeurs réalistes
UPDATE hotels SET hotel_commission = 10.00 WHERE hotel_commission = 0 OR hotel_commission IS NULL;
UPDATE hotels SET hairdresser_commission = 70.00 WHERE hairdresser_commission = 0 OR hairdresser_commission IS NULL;
UPDATE hotels SET country_code = 'FR' WHERE country_code IS NULL;

-- 1.3 Créer la table hotel_ledger (Grand Livre)
CREATE TABLE IF NOT EXISTS hotel_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid,
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT hotel_ledger_status_check CHECK (status IN ('pending', 'billed', 'paid'))
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_hotel_ledger_hotel_id ON hotel_ledger(hotel_id);
CREATE INDEX IF NOT EXISTS idx_hotel_ledger_status ON hotel_ledger(status);
CREATE INDEX IF NOT EXISTS idx_hotel_ledger_booking_id ON hotel_ledger(booking_id);

-- RLS pour hotel_ledger
ALTER TABLE hotel_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ledger" ON hotel_ledger
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 1.4 Créer la table hairdresser_payouts (Suivi des virements)
CREATE TABLE IF NOT EXISTS hairdresser_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid,
  hairdresser_id UUID NOT NULL REFERENCES hairdressers(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  stripe_transfer_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT hairdresser_payouts_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_hairdresser_payouts_hairdresser_id ON hairdresser_payouts(hairdresser_id);
CREATE INDEX IF NOT EXISTS idx_hairdresser_payouts_booking_id ON hairdresser_payouts(booking_id);
CREATE INDEX IF NOT EXISTS idx_hairdresser_payouts_status ON hairdresser_payouts(status);

-- RLS pour hairdresser_payouts
ALTER TABLE hairdresser_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage payouts" ON hairdresser_payouts
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Hairdressers can view their payouts" ON hairdresser_payouts
  FOR SELECT USING (hairdresser_id = get_hairdresser_id(auth.uid()));

-- Trigger pour updated_at sur hotel_ledger
CREATE TRIGGER update_hotel_ledger_updated_at
  BEFORE UPDATE ON hotel_ledger
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger pour updated_at sur hairdresser_payouts
CREATE TRIGGER update_hairdresser_payouts_updated_at
  BEFORE UPDATE ON hairdresser_payouts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();