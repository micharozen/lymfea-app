-- 1. NETTOYAGE (Optionnel : pour repartir sur du propre si besoin)
-- DELETE FROM public.treatment_rooms WHERE hotel_id = '00000000-0000-0000-0000-000000000010';

-- 2. CRÉATION DES SALLES AVEC TOUTES LES CONTRAINTES
INSERT INTO public.treatment_rooms (id, hotel_id, name, status, room_type, room_number)
VALUES 
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000010', 'Cabine Émeraude', 'Active', 'standard', '101'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000010', 'Espace Zen', 'Active', 'standard', '102'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000010', 'Suite Signature', 'Active', 'standard', '103')
ON CONFLICT (id) DO NOTHING;

-- 3. CRÉATION DES PRATICIENS
DO $$
DECLARE
    room1_id text := (SELECT id::text FROM treatment_rooms WHERE name = 'Cabine Émeraude' LIMIT 1);
    room2_id text := (SELECT id::text FROM treatment_rooms WHERE name = 'Espace Zen' LIMIT 1);
BEGIN
    INSERT INTO public.therapists (first_name, last_name, email, phone, status, gender, trunks, skills)
    VALUES 
      ('Jean', 'Dupont', 'jean.dupont@pro.com', '0611223344', 'Active', 'male', room1_id, ARRAY['Massage', 'Soin Visage']),
      ('Marie', 'Curie', 'marie.beauté@test.fr', '+33788990011', 'Active', 'female', room2_id, ARRAY['Épilation', 'Massage']),
      ('Alice', 'Wonderland', 'alice.w@spa.com', '0144556677', 'Active', 'female', room1_id, ARRAY['Gommage']),
      ('Marc', 'Lavoir', 'm.lavoir@gmail.com', '0600000001', 'Active', 'male', room2_id, ARRAY['Massage Sportif']),
      ('Sophie', 'Fonfec', 'sophie.f@outlook.fr', '0799887766', 'Active', 'female', room1_id, ARRAY['Beauté des mains'])
    ON CONFLICT DO NOTHING;
END $$;

-- 4. CRÉATION DES CLIENTS
INSERT INTO public.customers (first_name, last_name, email, phone, language)
VALUES 
  ('Thomas', 'O Malley', 'thomas@cat.com', '0612345678', 'fr'),
  ('Sarah', 'Connor', 'terminator@future.com', '0700000101', 'en'),
  ('Bruce', 'Wayne', 'batman@gotham.city', '0808080808', 'fr'),
  ('Elena', 'Gilbert', 'elena@mystic.com', '+33655443322', 'fr'),
  ('Arthur', 'Pendragon', 'roi.arthur@camelot.fr', '0677889900', 'fr')
ON CONFLICT DO NOTHING;

-- 5. CRÉATION DES RÉSERVATIONS
INSERT INTO public.bookings (
    hotel_id, hotel_name, client_first_name, client_last_name, 
    client_email, phone, booking_date, booking_time, 
    status, total_price, duration, room_id
)
SELECT 
    '00000000-0000-0000-0000-000000000010', 
    'Lymfea Test Hotel',
    c.first_name, 
    c.last_name, 
    c.email, 
    c.phone, 
    CURRENT_DATE + (row_number() over ()::text || ' day')::interval, 
    '14:00:00',
    'pending',
    95.00,
    60,
    (SELECT id FROM treatment_rooms LIMIT 1)
FROM public.customers c
LIMIT 5;