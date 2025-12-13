-- Make the signatures bucket private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'signatures';

-- Add RLS policy for signatures bucket - only admins and assigned hairdressers can read
CREATE POLICY "Admins can manage signatures"
ON storage.objects
FOR ALL
USING (
  bucket_id = 'signatures' 
  AND has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  bucket_id = 'signatures' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Hairdressers can view signatures for their bookings"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'signatures' 
  AND has_role(auth.uid(), 'hairdresser'::app_role)
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM bookings 
    WHERE hairdresser_id = get_hairdresser_id(auth.uid())
  )
);

CREATE POLICY "Concierges can view signatures for their hotel bookings"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'signatures' 
  AND has_role(auth.uid(), 'concierge'::app_role)
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM bookings 
    WHERE hotel_id IN (
      SELECT hotel_id FROM get_concierge_hotels(auth.uid())
    )
  )
);