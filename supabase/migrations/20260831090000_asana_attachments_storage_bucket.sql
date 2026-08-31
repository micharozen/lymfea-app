-- Bucket public accueillant les pièces jointes recopiées depuis Asana, pour qu'elles
-- s'affichent en aperçu dans les issues GitHub. Le dépôt étant privé, GitHub rend les
-- images via son proxy anonyme : il lui faut une URL lisible sans authentification.
--
-- L'écriture est réservée au service role (le workflow asana-sync), jamais au client :
-- aucune politique INSERT/UPDATE/DELETE n'est créée ici, et le service role contourne
-- RLS de toute façon.
INSERT INTO storage.buckets (id, name, public)
VALUES ('asana-attachments', 'asana-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Lecture publique : c'est ce qui permet l'aperçu inline côté GitHub.
CREATE POLICY "Public read access for asana attachments"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'asana-attachments');
