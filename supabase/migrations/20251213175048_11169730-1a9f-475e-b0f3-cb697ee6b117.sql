-- Remove redundant public SELECT policy on signatures bucket
-- The existing role-based policies already properly restrict access
DROP POLICY IF EXISTS "Public can view signatures" ON storage.objects;