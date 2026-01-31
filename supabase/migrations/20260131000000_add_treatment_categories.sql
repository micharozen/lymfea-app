-- ============================================
-- 1. Création de la table treatment_categories
-- ============================================
CREATE TABLE IF NOT EXISTS treatment_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(name, hotel_id)
);

-- Index pour les requêtes par hotel_id
CREATE INDEX IF NOT EXISTS idx_treatment_categories_hotel_id
  ON treatment_categories(hotel_id);

-- ============================================
-- 2. Row Level Security (RLS)
-- ============================================
ALTER TABLE treatment_categories ENABLE ROW LEVEL SECURITY;

-- Policy: Les admins peuvent tout faire
CREATE POLICY "Admins can manage categories" ON treatment_categories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Lecture publique (pour le client-side)
CREATE POLICY "Public can read categories" ON treatment_categories
  FOR SELECT USING (true);

-- ============================================
-- 3. Migration des données existantes
-- ============================================
-- Insère les catégories uniques depuis treatment_menus
INSERT INTO treatment_categories (name, hotel_id, sort_order)
SELECT DISTINCT
  tm.category,
  tm.hotel_id,
  CASE tm.category
    WHEN 'Blowout' THEN 1
    WHEN 'Brushing' THEN 1
    WHEN 'Hair cut' THEN 2
    WHEN 'Haircut' THEN 2
    WHEN 'Coloration' THEN 3
    WHEN 'Nails' THEN 4
    WHEN 'Nail' THEN 4
    ELSE 99
  END as sort_order
FROM treatment_menus tm
WHERE tm.hotel_id IS NOT NULL
  AND tm.category IS NOT NULL
  AND tm.category != ''
ON CONFLICT (name, hotel_id) DO NOTHING;

-- ============================================
-- 4. Trigger pour updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_treatment_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_treatment_categories_updated_at
  BEFORE UPDATE ON treatment_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_treatment_categories_updated_at();
