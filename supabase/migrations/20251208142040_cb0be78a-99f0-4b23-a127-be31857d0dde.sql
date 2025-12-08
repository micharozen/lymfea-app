-- Create storage bucket for email assets if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('assets', 'assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to assets bucket
CREATE POLICY "Public Access for assets" ON storage.objects 
FOR SELECT 
USING (bucket_id = 'assets');