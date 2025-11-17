-- Fix hairdressers table RLS policies
-- Drop the overly permissive public policies
DROP POLICY IF EXISTS "Anyone can view hairdressers" ON hairdressers;
DROP POLICY IF EXISTS "Admins can insert hairdressers" ON hairdressers;
DROP POLICY IF EXISTS "Admins can update hairdressers" ON hairdressers;
DROP POLICY IF EXISTS "Admins can delete hairdressers" ON hairdressers;

-- Add admin-only policies for hairdressers
CREATE POLICY "Admins can view hairdressers" 
ON hairdressers FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert hairdressers" 
ON hairdressers FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update hairdressers" 
ON hairdressers FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete hairdressers" 
ON hairdressers FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Fix hairdresser_hotels table RLS policies
DROP POLICY IF EXISTS "Anyone can view hairdresser hotels" ON hairdresser_hotels;
DROP POLICY IF EXISTS "Admins can insert hairdresser hotels" ON hairdresser_hotels;
DROP POLICY IF EXISTS "Admins can update hairdresser hotels" ON hairdresser_hotels;
DROP POLICY IF EXISTS "Admins can delete hairdresser hotels" ON hairdresser_hotels;

-- Add admin-only policies for hairdresser_hotels
CREATE POLICY "Admins can view hairdresser hotels" 
ON hairdresser_hotels FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage hairdresser hotels" 
ON hairdresser_hotels FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));