-- =============================================================
-- SEED DATA FOR LOCAL DEVELOPMENT ONLY
-- Run: supabase db reset (auto-executes after migrations)
-- =============================================================

-- Fixed UUIDs for predictability
-- Admin:        00000000-0000-0000-0000-000000000001
-- Therapist F: 00000000-0000-0000-0000-000000000002
-- Therapist M: 00000000-0000-0000-0000-000000000004
-- Concierge:   00000000-0000-0000-0000-000000000003
-- Hotel 1:     00000000-0000-0000-0000-000000000010
-- Hotel 2:     00000000-0000-0000-0000-000000000011

-- 1) Auth users (password: "password" for all)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin
) VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated',
    'admin@oom.dev',
    crypt('password', gen_salt('bf')),
    NOW(), NOW(), NOW(),
    '', '',
    '', '', '',
    '', '',
    '{"provider":"email","providers":["email"]}', '{}',
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated',
    'therapist@lymfea.dev',
    crypt('password', gen_salt('bf')),
    NOW(), NOW(), NOW(),
    '', '',
    '', '', '',
    '', '',
    '{"provider":"email","providers":["email"]}', '{}',
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated',
    'concierge@oom.dev',
    crypt('password', gen_salt('bf')),
    NOW(), NOW(), NOW(),
    '', '',
    '', '', '',
    '', '',
    '{"provider":"email","providers":["email"]}', '{}',
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000004',
    'authenticated', 'authenticated',
    'therapist-m@lymfea.dev',
    crypt('password', gen_salt('bf')),
    NOW(), NOW(), NOW(),
    '', '',
    '', '', '',
    '', '',
    '{"provider":"email","providers":["email"]}', '{}',
    false
  );

-- 2) Identity records
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
) VALUES
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000001',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000000001', 'email', 'admin@oom.dev'),
    'email',
    '00000000-0000-0000-0000-000000000001',
    NOW(), NOW(), NOW()
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000002',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000000002', 'email', 'therapist@lymfea.dev'),
    'email',
    '00000000-0000-0000-0000-000000000002',
    NOW(), NOW(), NOW()
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000003',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000000003', 'email', 'concierge@oom.dev'),
    'email',
    '00000000-0000-0000-0000-000000000003',
    NOW(), NOW(), NOW()
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000004',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000000004', 'email', 'therapist-m@lymfea.dev'),
    'email',
    '00000000-0000-0000-0000-000000000004',
    NOW(), NOW(), NOW()
  );

-- 3) Test hotel
INSERT INTO public.hotels (id, name, status, opening_time, closing_time, timezone, address, city, country, postal_code, landing_subtitle, venue_type, currency, slot_interval, country_code, booking_hold_enabled, client_payment_mode)
VALUES (
  '00000000-0000-0000-0000-000000000010',
  'Hôtel Hana',
  'active',
  '08:00',
  '20:00',
  'Europe/Paris',
  '17 rue du quatre - septembre',
  'Paris',
  'France',
  '75002',
  'Paris',
  'hotel',
  'EUR',
  30,
  'FR',
  false,
  'pay_at_booking'
);

-- 3b) Second test venue (spa type)
INSERT INTO public.hotels (id, name, status, opening_time, closing_time, timezone, address, city, country, postal_code, landing_subtitle, venue_type, currency, slot_interval, country_code, booking_hold_enabled, client_payment_mode)
VALUES (
  '00000000-0000-0000-0000-000000000011',
  'Spa Nara',
  'active',
  '09:00',
  '21:00',
  'Europe/Paris',
  '42 avenue Montaigne',
  'Paris',
  'France',
  '75008',
  'Paris',
  'hotel',
  'EUR',
  30,
  'FR',
  false,
  'pay_at_booking'
);

-- 4) Admin record (super-admin for local org multitenancy testing)
INSERT INTO public.admins (id, user_id, email, first_name, last_name, phone, status, country_code, is_super_admin, organization_id)
VALUES (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  'admin@oom.dev',
  'Michael', 'Admin',
  '0600000001',
  'Actif',
  '+33',
  true,
  'a0000000-0000-0000-0000-000000000001'
);

-- 5) Therapist records
-- skills = les 17 clés de SPECIALTY_OPTIONS (src/lib/specialtyTypes.ts), pour que
-- chaque thérapeute matche n'importe quel soin seedé.
INSERT INTO public.therapists (id, user_id, email, first_name, last_name, phone, status, password_set, country_code, minimum_guarantee, skills, gender, trunks, rate_60, rate_75, rate_90)
VALUES
  (
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000002',
    'therapist@lymfea.dev',
    'Dev', 'Therapist',
    '600000002',
    'Actif',
    true,
    '+33',
    '{"1": 3, "2": 2, "3": 4, "4": 3, "5": 2, "6": 1, "0": 0}',
    '{relaxing_massage,deep_tissue,hot_stones,aromatherapy,prenatal_massage,sports_massage,lymphatic_drainage,facial,body_treatment,body_scrub,body_wrap,manicure_pedicure,hair_removal,hydrotherapy,reflexology,ayurveda,yoga}',
    'female',
    '00000000-0000-0000-0000-000000000030',
    50.00, 60.00, 70.00
  ),
  (
    '00000000-0000-0000-0000-000000000104',
    '00000000-0000-0000-0000-000000000004',
    'therapist-m@lymfea.dev',
    'Marc', 'Therapist',
    '600000004',
    'Actif',
    true,
    '+33',
    '{"1": 3, "2": 2, "3": 4, "4": 3, "5": 2, "6": 1, "0": 0}',
    '{relaxing_massage,deep_tissue,hot_stones,aromatherapy,prenatal_massage,sports_massage,lymphatic_drainage,facial,body_treatment,body_scrub,body_wrap,manicure_pedicure,hair_removal,hydrotherapy,reflexology,ayurveda,yoga}',
    'male',
    '00000000-0000-0000-0000-000000000031',
    55.00, 65.00, 75.00
  );

-- 6) Concierge record
INSERT INTO public.concierges (id, user_id, email, first_name, last_name, phone, status, country_code, hotel_id, must_change_password)
VALUES (
  '00000000-0000-0000-0000-000000000103',
  '00000000-0000-0000-0000-000000000003',
  'concierge@oom.dev',
  'Dev', 'Concierge',
  '0600000003',
  'Actif',
  '+33',
  '00000000-0000-0000-0000-000000000010',
  false
);

-- 7) Link concierge to test hotels
INSERT INTO public.concierge_hotels (id, concierge_id, hotel_id)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000010'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000011');

-- 8) Link therapists to test hotels
INSERT INTO public.therapist_venues (id, therapist_id, hotel_id)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000010'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000010'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000011'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000011');

-- 9) Treatment categories + treatments (Noms harmonisés au singulier)
INSERT INTO public.treatment_categories (id, name, hotel_id, sort_order)
VALUES
  ('00000000-0000-0000-0000-000000000020', 'Massage', '00000000-0000-0000-0000-000000000010', 1),
  ('00000000-0000-0000-0000-000000000022', 'Soin du visage', '00000000-0000-0000-0000-000000000010', 2),
  ('00000000-0000-0000-0000-000000000023', 'Soin du corps', '00000000-0000-0000-0000-000000000010', 3);

INSERT INTO public.treatment_menus (id, name, category, hotel_id, service_for, duration, price, currency, status, description, is_bestseller)
VALUES
  ('00000000-0000-0000-0000-000000000021', 'Massage relaxant', 'Massage', '00000000-0000-0000-0000-000000000010', 'All', 60, 90.00, 'EUR', 'active', 'Massage aux huiles essentielles pour une relaxation profonde', true),
  ('00000000-0000-0000-0000-000000000024', 'Deep tissue', 'Massage', '00000000-0000-0000-0000-000000000010', 'All', 75, 120.00, 'EUR', 'active', 'Massage en profondeur pour soulager les tensions musculaires', false),
  ('00000000-0000-0000-0000-000000000025', 'Soin éclat visage', 'Soin du visage', '00000000-0000-0000-0000-000000000010', 'All', 45, 75.00, 'EUR', 'active', 'Nettoyage, gommage et masque pour un teint lumineux', true),
  ('00000000-0000-0000-0000-000000000026', 'Gommage corps', 'Soin du corps', '00000000-0000-0000-0000-000000000010', 'All', 30, 55.00, 'EUR', 'active', 'Exfoliation douce au sel marin et huile d''argan', false),
  ('00000000-0000-0000-0000-000000000027', 'Enveloppement détox', 'Soin du corps', '00000000-0000-0000-0000-000000000010', 'All', 50, 85.00, 'EUR', 'active', 'Enveloppement aux algues pour purifier et revitaliser', true);

-- 9b) Treatment categories + treatments for Spa Nara
INSERT INTO public.treatment_categories (id, name, hotel_id, sort_order)
VALUES
  ('00000000-0000-0000-0000-000000000040', 'Massage', '00000000-0000-0000-0000-000000000011', 1),
  ('00000000-0000-0000-0000-000000000041', 'Soin du visage', '00000000-0000-0000-0000-000000000011', 2),
  ('00000000-0000-0000-0000-000000000042', 'Soin du corps', '00000000-0000-0000-0000-000000000011', 3);

INSERT INTO public.treatment_menus (id, name, category, hotel_id, service_for, duration, price, currency, status, description, is_bestseller)
VALUES
  ('00000000-0000-0000-0000-000000000043', 'Massage suédois', 'Massage', '00000000-0000-0000-0000-000000000011', 'All', 60, 95.00, 'EUR', 'active', 'Massage tonique aux techniques suédoises traditionnelles', true),
  ('00000000-0000-0000-0000-000000000044', 'Massage aux pierres chaudes', 'Massage', '00000000-0000-0000-0000-000000000011', 'All', 90, 140.00, 'EUR', 'active', 'Massage avec pierres volcaniques pour une détente profonde', false),
  ('00000000-0000-0000-0000-000000000045', 'Soin hydratant visage', 'Soin du visage', '00000000-0000-0000-0000-000000000011', 'All', 50, 80.00, 'EUR', 'active', 'Soin intensif hydratation et éclat pour peaux sèches', true),
  ('00000000-0000-0000-0000-000000000046', 'Modelage corps relaxant', 'Soin du corps', '00000000-0000-0000-0000-000000000011', 'All', 45, 70.00, 'EUR', 'active', 'Modelage doux aux huiles chaudes pour un bien-être total', false);

-- 9c) Add-on treatments (is_addon = true) — proposés en supplément dans le flow client.
-- Ils ne s'affichent pas dans le menu principal, seulement via get_public_treatment_addons.
INSERT INTO public.treatment_menus (id, name, name_en, category, hotel_id, service_for, duration, price, currency, status, description, description_en, is_addon)
VALUES
  -- Hôtel Hana
  ('00000000-0000-0000-0000-000000000050', 'Massage du cuir chevelu', 'Scalp massage',  'Massage',        '00000000-0000-0000-0000-000000000010', 'All', 15, 25.00, 'EUR', 'active', 'Massage crânien relaxant en fin de soin', 'Relaxing scalp massage to close the treatment', true),
  ('00000000-0000-0000-0000-000000000051', 'Masque hydratant',        'Hydrating mask', 'Soin du visage', '00000000-0000-0000-0000-000000000010', 'All', 15, 30.00, 'EUR', 'active', 'Masque nourrissant à l''acide hyaluronique', 'Nourishing hyaluronic acid mask', true),
  ('00000000-0000-0000-0000-000000000052', 'Réflexologie plantaire',  'Foot reflexology','Soin du corps', '00000000-0000-0000-0000-000000000010', 'All', 20, 35.00, 'EUR', 'active', 'Pressions ciblées sur les points réflexes des pieds', 'Targeted pressure on the foot reflex points', true),
  -- Spa Nara
  ('00000000-0000-0000-0000-000000000060', 'Massage du cuir chevelu', 'Scalp massage',  'Massage',        '00000000-0000-0000-0000-000000000011', 'All', 15, 28.00, 'EUR', 'active', 'Massage crânien relaxant en fin de soin', 'Relaxing scalp massage to close the treatment', true),
  ('00000000-0000-0000-0000-000000000061', 'Masque hydratant',        'Hydrating mask', 'Soin du visage', '00000000-0000-0000-0000-000000000011', 'All', 15, 32.00, 'EUR', 'active', 'Masque nourrissant à l''acide hyaluronique', 'Nourishing hyaluronic acid mask', true),
  ('00000000-0000-0000-0000-000000000062', 'Réflexologie plantaire',  'Foot reflexology','Soin du corps', '00000000-0000-0000-0000-000000000011', 'All', 20, 38.00, 'EUR', 'active', 'Pressions ciblées sur les points réflexes des pieds', 'Targeted pressure on the foot reflex points', true);

-- 9d) Chaque soin (non add-on) reçoit les 3 add-ons de son lieu.
INSERT INTO public.treatment_addons (parent_treatment_id, addon_treatment_id, sort_order)
SELECT parent.id, addon.id, addon.sort_order
FROM public.treatment_menus parent
JOIN (
  VALUES
    ('00000000-0000-0000-0000-000000000050'::uuid, 0),
    ('00000000-0000-0000-0000-000000000051'::uuid, 1),
    ('00000000-0000-0000-0000-000000000052'::uuid, 2),
    ('00000000-0000-0000-0000-000000000060'::uuid, 0),
    ('00000000-0000-0000-0000-000000000061'::uuid, 1),
    ('00000000-0000-0000-0000-000000000062'::uuid, 2)
) AS addon(id, sort_order) ON true
JOIN public.treatment_menus addon_menu ON addon_menu.id = addon.id
WHERE parent.is_addon = false
  AND parent.hotel_id = addon_menu.hotel_id;

-- 10) Treatment rooms
INSERT INTO public.treatment_rooms (id, name, room_number, room_type, status, hotel_id, hotel_name, capacity)
VALUES
  ('00000000-0000-0000-0000-000000000030', 'Salle de Massage #1', 'ROOM-DEV-001', 'Massage', 'active', '00000000-0000-0000-0000-000000000010', 'Hôtel Hana', 1),
  ('00000000-0000-0000-0000-000000000031', 'Salle de Massage #2', 'ROOM-DEV-002', 'Massage', 'active', '00000000-0000-0000-0000-000000000010', 'Hôtel Hana', 1);

-- 10b) Treatment rooms for Spa Nara
INSERT INTO public.treatment_rooms (id, name, room_number, room_type, status, hotel_id, hotel_name, capacity)
VALUES
  ('00000000-0000-0000-0000-000000000032', 'Cabine Zen', 'ROOM-DEV-003', 'Massage', 'active', '00000000-0000-0000-0000-000000000011', 'Spa Nara', 1),
  ('00000000-0000-0000-0000-000000000033', 'Cabine Lotus', 'ROOM-DEV-004', 'Massage', 'active', '00000000-0000-0000-0000-000000000011', 'Spa Nara', 1);

-- 11) Venue deployment schedule
INSERT INTO public.venue_deployment_schedules (id, hotel_id, schedule_type, recurrence_interval)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000010', 'always_open', 1),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000011', 'always_open', 1);

-- 12) User roles
INSERT INTO public.user_roles (id, user_id, role)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'admin'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 'therapist'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000003', 'concierge'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000004', 'therapist');

-- 13) Fake bookings (mix of statuses, dates, venues, therapists, payment methods)
-- Treatment IDs reference:
--   Hôtel Hana: 21 (Massage relaxant 60min/90€), 24 (Deep tissue 75min/120€),
--               25 (Soin éclat visage 45min/75€), 26 (Gommage corps 30min/55€),
--               27 (Enveloppement détox 50min/85€)
--   Spa Nara:   43 (Massage suédois 60min/95€), 44 (Pierres chaudes 90min/140€),
--               45 (Soin hydratant 50min/80€), 46 (Modelage corps 45min/70€)
INSERT INTO public.bookings (
  id, hotel_id, hotel_name, client_first_name, client_last_name, phone, client_email,
  room_number, booking_date, booking_time, status, therapist_id, therapist_name,
  total_price, duration, payment_method, payment_status, room_id, client_note
) VALUES
  -- Past bookings (completed)
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000010', 'Hôtel Hana',
   'Sophie', 'Martin', '0612345678', 'sophie.martin@example.com',
   '305', CURRENT_DATE - INTERVAL '7 days', '10:00', 'completed',
   '00000000-0000-0000-0000-000000000102', 'Dev Therapist',
   90.00, 60, 'room', 'charged_to_room', '00000000-0000-0000-0000-000000000030', 'Pression douce svp'),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000010', 'Hôtel Hana',
   'Pierre', 'Dubois', '0623456789', 'pierre.dubois@example.com',
   '412', CURRENT_DATE - INTERVAL '5 days', '14:30', 'completed',
   '00000000-0000-0000-0000-000000000104', 'Marc Therapist',
   120.00, 75, 'card', 'paid', '00000000-0000-0000-0000-000000000031', NULL),
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000011', 'Spa Nara',
   'Emma', 'Laurent', '0634567890', 'emma.laurent@example.com',
   NULL, CURRENT_DATE - INTERVAL '3 days', '11:00', 'completed',
   '00000000-0000-0000-0000-000000000102', 'Dev Therapist',
   95.00, 60, 'card', 'paid', '00000000-0000-0000-0000-000000000030', NULL),
  ('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000010', 'Hôtel Hana',
   'Lucas', 'Bernard', '0645678901', 'lucas.bernard@example.com',
   '208', CURRENT_DATE - INTERVAL '2 days', '16:00', 'cancelled',
   '00000000-0000-0000-0000-000000000104', 'Marc Therapist',
   75.00, 45, 'room', 'pending', '00000000-0000-0000-0000-000000000031', 'Annulé client'),
  ('00000000-0000-0000-0000-000000000205', '00000000-0000-0000-0000-000000000011', 'Spa Nara',
   'Camille', 'Petit', '0656789012', 'camille.petit@example.com',
   NULL, CURRENT_DATE - INTERVAL '1 days', '15:30', 'noshow',
   '00000000-0000-0000-0000-000000000102', 'Dev Therapist',
   70.00, 45, 'card', 'pending', '00000000-0000-0000-0000-000000000030', NULL),

  -- Today
  ('00000000-0000-0000-0000-000000000206', '00000000-0000-0000-0000-000000000010', 'Hôtel Hana',
   'Julie', 'Moreau', '0667890123', 'julie.moreau@example.com',
   '501', CURRENT_DATE, '09:30', 'completed',
   '00000000-0000-0000-0000-000000000102', 'Dev Therapist',
   85.00, 50, 'room', 'charged_to_room', '00000000-0000-0000-0000-000000000030', NULL),
  ('00000000-0000-0000-0000-000000000207', '00000000-0000-0000-0000-000000000010', 'Hôtel Hana',
   'Thomas', 'Roux', '0678901234', 'thomas.roux@example.com',
   '303', CURRENT_DATE, '14:00', 'ongoing',
   '00000000-0000-0000-0000-000000000104', 'Marc Therapist',
   120.00, 75, 'card', 'paid', '00000000-0000-0000-0000-000000000031', 'Dos tendu'),
  ('00000000-0000-0000-0000-000000000208', '00000000-0000-0000-0000-000000000011', 'Spa Nara',
   'Marie', 'Lefebvre', '0689012345', 'marie.lefebvre@example.com',
   NULL, CURRENT_DATE, '17:00', 'confirmed',
   '00000000-0000-0000-0000-000000000102', 'Dev Therapist',
   140.00, 90, 'card', 'paid', '00000000-0000-0000-0000-000000000030', NULL),

  -- Future bookings
  ('00000000-0000-0000-0000-000000000209', '00000000-0000-0000-0000-000000000010', 'Hôtel Hana',
   'Antoine', 'Garcia', '0690123456', 'antoine.garcia@example.com',
   '410', CURRENT_DATE + INTERVAL '1 days', '10:30', 'confirmed',
   '00000000-0000-0000-0000-000000000104', 'Marc Therapist',
   90.00, 60, 'room', 'pending', '00000000-0000-0000-0000-000000000031', NULL),
  ('00000000-0000-0000-0000-000000000210', '00000000-0000-0000-0000-000000000011', 'Spa Nara',
   'Léa', 'Rousseau', '0601234567', 'lea.rousseau@example.com',
   NULL, CURRENT_DATE + INTERVAL '2 days', '11:30', 'pending',
   NULL, NULL,
   80.00, 50, 'card', 'pending', NULL, 'Première visite'),
  ('00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000010', 'Hôtel Hana',
   'Nicolas', 'Vincent', '0612340987', 'nicolas.vincent@example.com',
   '215', CURRENT_DATE + INTERVAL '3 days', '15:00', 'confirmed',
   '00000000-0000-0000-0000-000000000102', 'Dev Therapist',
   55.00, 30, 'card', 'paid', '00000000-0000-0000-0000-000000000030', NULL),
  ('00000000-0000-0000-0000-000000000212', '00000000-0000-0000-0000-000000000010', 'Hôtel Hana',
   'Charlotte', 'Fournier', '0623450987', 'charlotte.fournier@example.com',
   '602', CURRENT_DATE + INTERVAL '5 days', '18:00', 'pending',
   NULL, NULL,
   85.00, 50, 'room', 'pending', NULL, NULL),
  ('00000000-0000-0000-0000-000000000213', '00000000-0000-0000-0000-000000000011', 'Spa Nara',
   'Maxime', 'Girard', '0634560987', 'maxime.girard@example.com',
   NULL, CURRENT_DATE + INTERVAL '7 days', '13:00', 'confirmed',
   '00000000-0000-0000-0000-000000000104', 'Marc Therapist',
   95.00, 60, 'card', 'paid', '00000000-0000-0000-0000-000000000031', NULL);

-- 14) Treatment variants (durée / nombre de personnes)
-- Variant IDs reference (used by email_inquiries below):
--   Massage relaxant (21):    300 = 60 min solo (default), 301 = 90 min solo, 302 = 60 min duo
--   Deep tissue (24):         310 = 75 min solo (default)
--   Soin éclat visage (25):   320 = 45 min solo (default)
--   Enveloppement détox (27): 330 = 50 min solo (default), 331 = 80 min solo
--   Massage suédois (43):     340 = 60 min solo (default), 341 = 90 min solo
-- Plus default-only variants for the remaining seeded treatments (26, 44, 45, 46)
-- so booking_treatments below can reference a variant_id for every row.
INSERT INTO public.treatment_variants (id, treatment_id, label, label_en, duration, price, guest_count, is_default, status, sort_order)
VALUES
  ('00000000-0000-0000-0000-000000000300', '00000000-0000-0000-0000-000000000021', '60 min',           '60 min',          60, 90.00,  1, true,  'active', 1),
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000021', '90 min',           '90 min',          90, 130.00, 1, false, 'active', 2),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000021', '60 min · duo',     '60 min · couple', 60, 170.00, 2, false, 'active', 3),
  ('00000000-0000-0000-0000-000000000310', '00000000-0000-0000-0000-000000000024', '75 min',           '75 min',          75, 120.00, 1, true,  'active', 1),
  ('00000000-0000-0000-0000-000000000320', '00000000-0000-0000-0000-000000000025', '45 min',           '45 min',          45, 75.00,  1, true,  'active', 1),
  ('00000000-0000-0000-0000-000000000326', '00000000-0000-0000-0000-000000000026', '30 min',           '30 min',          30, 55.00,  1, true,  'active', 1),
  ('00000000-0000-0000-0000-000000000330', '00000000-0000-0000-0000-000000000027', '50 min',           '50 min',          50, 85.00,  1, true,  'active', 1),
  ('00000000-0000-0000-0000-000000000331', '00000000-0000-0000-0000-000000000027', '80 min',           '80 min',          80, 130.00, 1, false, 'active', 2),
  ('00000000-0000-0000-0000-000000000340', '00000000-0000-0000-0000-000000000043', '60 min',           '60 min',          60, 95.00,  1, true,  'active', 1),
  ('00000000-0000-0000-0000-000000000341', '00000000-0000-0000-0000-000000000043', '90 min',           '90 min',          90, 135.00, 1, false, 'active', 2),
  ('00000000-0000-0000-0000-000000000344', '00000000-0000-0000-0000-000000000044', '90 min',           '90 min',          90, 140.00, 1, true,  'active', 1),
  ('00000000-0000-0000-0000-000000000345', '00000000-0000-0000-0000-000000000045', '50 min',           '50 min',          50, 80.00,  1, true,  'active', 1),
  ('00000000-0000-0000-0000-000000000346', '00000000-0000-0000-0000-000000000046', '45 min',           '45 min',          45, 70.00,  1, true,  'active', 1);

-- 15) Booking treatments (link bookings to treatment menus + variants)
INSERT INTO public.booking_treatments (id, booking_id, treatment_id, variant_id) VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000300'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000310'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000340'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-000000000320'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000205', '00000000-0000-0000-0000-000000000046', '00000000-0000-0000-0000-000000000346'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000206', '00000000-0000-0000-0000-000000000027', '00000000-0000-0000-0000-000000000330'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000207', '00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000310'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000208', '00000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000344'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000209', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000300'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000210', '00000000-0000-0000-0000-000000000045', '00000000-0000-0000-0000-000000000345'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000026', '00000000-0000-0000-0000-000000000326'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000212', '00000000-0000-0000-0000-000000000027', '00000000-0000-0000-0000-000000000330'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000213', '00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000340');

-- 16) Persistent customer profiles
-- One row per distinct client in the bookings fixture. Linked back via
-- bookings.customer_id below so the Partner API (/v1/venues/:slug/customers)
-- has data to return. UUIDs in the 300-series for readability.
INSERT INTO public.customers (
  id, first_name, last_name, email, phone, language, profile_completed
) VALUES
  ('00000000-0000-0000-0000-000000000501', 'Sophie',    'Martin',    'sophie.martin@example.com',    '+33612345678', 'fr', true),
  ('00000000-0000-0000-0000-000000000502', 'Pierre',    'Dubois',    'pierre.dubois@example.com',    '+33623456789', 'fr', true),
  ('00000000-0000-0000-0000-000000000503', 'Emma',      'Laurent',   'emma.laurent@example.com',     '+33634567890', 'fr', true),
  ('00000000-0000-0000-0000-000000000504', 'Lucas',     'Bernard',   'lucas.bernard@example.com',    '+33645678901', 'fr', true),
  ('00000000-0000-0000-0000-000000000505', 'Camille',   'Petit',     'camille.petit@example.com',    '+33656789012', 'fr', true),
  ('00000000-0000-0000-0000-000000000506', 'Julie',     'Moreau',    'julie.moreau@example.com',     '+33667890123', 'fr', true),
  ('00000000-0000-0000-0000-000000000507', 'Thomas',    'Roux',      'thomas.roux@example.com',      '+33678901234', 'fr', true),
  ('00000000-0000-0000-0000-000000000508', 'Marie',     'Lefebvre',  'marie.lefebvre@example.com',   '+33689012345', 'en', true),
  ('00000000-0000-0000-0000-000000000509', 'Antoine',   'Garcia',    'antoine.garcia@example.com',   '+33690123456', 'fr', true),
  ('00000000-0000-0000-0000-000000000510', 'Léa',       'Rousseau',  'lea.rousseau@example.com',     '+33601234567', 'fr', false),
  ('00000000-0000-0000-0000-000000000511', 'Nicolas',   'Vincent',   'nicolas.vincent@example.com',  '+33612340987', 'fr', true),
  ('00000000-0000-0000-0000-000000000512', 'Charlotte', 'Fournier',  'charlotte.fournier@example.com', '+33623450987', 'fr', true),
  ('00000000-0000-0000-0000-000000000513', 'Maxime',    'Girard',    'maxime.girard@example.com',    '+33634560987', 'en', true);

-- 17) Backfill bookings.customer_id (booking 2NN -> customer 5NN).
--     Kept as UPDATEs (rather than inlined in section 13) to minimise diff.
UPDATE public.bookings SET customer_id = '00000000-0000-0000-0000-000000000501' WHERE id = '00000000-0000-0000-0000-000000000201';
UPDATE public.bookings SET customer_id = '00000000-0000-0000-0000-000000000502' WHERE id = '00000000-0000-0000-0000-000000000202';
UPDATE public.bookings SET customer_id = '00000000-0000-0000-0000-000000000503' WHERE id = '00000000-0000-0000-0000-000000000203';
UPDATE public.bookings SET customer_id = '00000000-0000-0000-0000-000000000504' WHERE id = '00000000-0000-0000-0000-000000000204';
UPDATE public.bookings SET customer_id = '00000000-0000-0000-0000-000000000505' WHERE id = '00000000-0000-0000-0000-000000000205';
UPDATE public.bookings SET customer_id = '00000000-0000-0000-0000-000000000506' WHERE id = '00000000-0000-0000-0000-000000000206';
UPDATE public.bookings SET customer_id = '00000000-0000-0000-0000-000000000507' WHERE id = '00000000-0000-0000-0000-000000000207';
UPDATE public.bookings SET customer_id = '00000000-0000-0000-0000-000000000508' WHERE id = '00000000-0000-0000-0000-000000000208';
UPDATE public.bookings SET customer_id = '00000000-0000-0000-0000-000000000509' WHERE id = '00000000-0000-0000-0000-000000000209';
UPDATE public.bookings SET customer_id = '00000000-0000-0000-0000-000000000510' WHERE id = '00000000-0000-0000-0000-000000000210';
UPDATE public.bookings SET customer_id = '00000000-0000-0000-0000-000000000511' WHERE id = '00000000-0000-0000-0000-000000000211';
UPDATE public.bookings SET customer_id = '00000000-0000-0000-0000-000000000512' WHERE id = '00000000-0000-0000-0000-000000000212';
UPDATE public.bookings SET customer_id = '00000000-0000-0000-0000-000000000513' WHERE id = '00000000-0000-0000-0000-000000000213';

-- 18) Fake email_inquiries (inbox)
-- Couvre les états de l'UI inbox :
--   - received       : webhook reçu, pas encore parsé
--   - parsed (auto)  : tous les critères auto-convert OK (conf >= 0.8, treatment + variant + date + heure)
--   - parsed (review): conf basse ou champs manquants → review uniquement
--   - failed         : LLM/lookup en échec, message d'erreur
--   - converted      : déjà convertie en booking (référence un booking existant)
--   - orphan         : reçue sur un alias inconnu, hotel_id NULL
INSERT INTO public.email_inquiries (
  id, hotel_id, from_address, to_address, subject, raw_body_text, raw_body_html,
  parsed_data, confidence_score, status, booking_id, error_message, message_id, created_at
) VALUES
  -- A) Auto-convert ready — Hôtel Hana, Massage relaxant 60 min solo
  ('00000000-0000-0000-0000-000000000400',
   '00000000-0000-0000-0000-000000000010',
   'sophie.bernard@example.com',
   'hotel-hana@booking.eia.fr',
   'Réservation massage relaxant',
   E'Bonjour,\n\nJe souhaite réserver un massage relaxant de 60 minutes pour demain à 15h00, pour une personne.\n\nMes coordonnées :\nSophie Bernard\n+33 6 11 22 33 44\nsophie.bernard@example.com\n\nMerci d''avance,\nSophie',
   NULL,
   jsonb_build_object(
     'client_first_name', 'Sophie',
     'client_last_name', 'Bernard',
     'email', 'sophie.bernard@example.com',
     'phone', '+33 6 11 22 33 44',
     'requested_date', to_char(CURRENT_DATE + INTERVAL '1 day', 'YYYY-MM-DD'),
     'requested_time', '15:00',
     'treatment_match', jsonb_build_object('id', '00000000-0000-0000-0000-000000000021', 'confidence', 0.95),
     'variant_match',   jsonb_build_object('id', '00000000-0000-0000-0000-000000000300', 'confidence', 0.92),
     'guest_count', 1,
     'notes', NULL,
     'intent_confidence', 0.94,
     'detected_language', 'fr'
   ),
   0.94, 'parsed', NULL, NULL, '<seed-inq-400@example.com>', NOW() - INTERVAL '15 minutes'),

  -- B) Auto-convert ready — Spa Nara, Massage suédois 90 min solo
  ('00000000-0000-0000-0000-000000000401',
   '00000000-0000-0000-0000-000000000011',
   'thomas.legrand@example.com',
   'spa-nara@booking.eia.fr',
   'Demande de réservation',
   E'Hello,\n\nI would like to book a 90 minute swedish massage for Saturday at 5pm, for one person.\nMy phone is +33 6 55 44 33 22.\n\nThanks,\nThomas Legrand',
   NULL,
   jsonb_build_object(
     'client_first_name', 'Thomas',
     'client_last_name', 'Legrand',
     'email', 'thomas.legrand@example.com',
     'phone', '+33 6 55 44 33 22',
     'requested_date', to_char(CURRENT_DATE + INTERVAL '3 days', 'YYYY-MM-DD'),
     'requested_time', '17:00',
     'treatment_match', jsonb_build_object('id', '00000000-0000-0000-0000-000000000043', 'confidence', 0.97),
     'variant_match',   jsonb_build_object('id', '00000000-0000-0000-0000-000000000341', 'confidence', 0.95),
     'guest_count', 1,
     'notes', NULL,
     'intent_confidence', 0.93,
     'detected_language', 'en'
   ),
   0.93, 'parsed', NULL, NULL, '<seed-inq-401@example.com>', NOW() - INTERVAL '1 hour'),

  -- C) Review only — confidence basse (LLM hésite entre 2 soins), variant null
  ('00000000-0000-0000-0000-000000000402',
   '00000000-0000-0000-0000-000000000010',
   'amelie.rousseau@example.com',
   'hotel-hana@booking.eia.fr',
   'Question rapide',
   E'Bonjour,\n\nEst-ce que vous proposez un soin du visage à hydrater ?\nJe serais dispo jeudi prochain.\n\nAmélie',
   NULL,
   jsonb_build_object(
     'client_first_name', 'Amélie',
     'client_last_name', 'Rousseau',
     'email', 'amelie.rousseau@example.com',
     'phone', NULL,
     'requested_date', to_char(CURRENT_DATE + INTERVAL '4 days', 'YYYY-MM-DD'),
     'requested_time', NULL,
     'treatment_match', jsonb_build_object('id', '00000000-0000-0000-0000-000000000025', 'confidence', 0.55),
     'variant_match',   NULL,
     'guest_count', 1,
     'notes', 'Client demande de l''hydratation mais pas de soin précis',
     'intent_confidence', 0.62,
     'detected_language', 'fr'
   ),
   0.62, 'parsed', NULL, NULL, '<seed-inq-402@example.com>', NOW() - INTERVAL '3 hours'),

  -- D) Review only — date/heure manquantes, mais soin + variante clairs
  ('00000000-0000-0000-0000-000000000403',
   '00000000-0000-0000-0000-000000000010',
   'marc.fontaine@example.com',
   'hotel-hana@booking.eia.fr',
   'Réservation enveloppement détox',
   E'Bonjour,\n\nJe souhaite réserver un enveloppement détox 80 minutes. Quels créneaux avez-vous la semaine prochaine ?\n\nMarc Fontaine\n06 99 88 77 66',
   NULL,
   jsonb_build_object(
     'client_first_name', 'Marc',
     'client_last_name', 'Fontaine',
     'email', 'marc.fontaine@example.com',
     'phone', '06 99 88 77 66',
     'requested_date', NULL,
     'requested_time', NULL,
     'treatment_match', jsonb_build_object('id', '00000000-0000-0000-0000-000000000027', 'confidence', 0.91),
     'variant_match',   jsonb_build_object('id', '00000000-0000-0000-0000-000000000331', 'confidence', 0.89),
     'guest_count', 1,
     'notes', 'Pas de créneau précis — propose la semaine prochaine',
     'intent_confidence', 0.85,
     'detected_language', 'fr'
   ),
   0.85, 'parsed', NULL, NULL, '<seed-inq-403@example.com>', NOW() - INTERVAL '6 hours'),

  -- E) Received (webhook reçu, parsing pas encore lancé / en cours)
  ('00000000-0000-0000-0000-000000000404',
   '00000000-0000-0000-0000-000000000011',
   'julie.moreau@example.com',
   'spa-nara@booking.eia.fr',
   'Disponibilités ce week-end',
   E'Bonjour, auriez-vous des disponibilités samedi ou dimanche pour un massage ? Merci',
   NULL,
   NULL, NULL, 'received', NULL, NULL, '<seed-inq-404@example.com>', NOW() - INTERVAL '2 minutes'),

  -- F) Failed — LLM ou lookup en échec
  ('00000000-0000-0000-0000-000000000405',
   '00000000-0000-0000-0000-000000000010',
   'noreply@spam-network.example',
   'hotel-hana@booking.eia.fr',
   'Free vacation winner!!!',
   E'You have won a free vacation. Click here to claim.',
   NULL,
   NULL, NULL, 'failed', NULL, 'Detected as non-booking intent (spam)', '<seed-inq-405@example.com>', NOW() - INTERVAL '1 day'),

  -- G) Converted — déjà liée à un booking existant (212)
  ('00000000-0000-0000-0000-000000000406',
   '00000000-0000-0000-0000-000000000010',
   'charlotte.fournier@example.com',
   'hotel-hana@booking.eia.fr',
   'Réservation enveloppement détox',
   E'Bonjour, je voudrais un enveloppement détox de 50 min pour dans 5 jours à 18h. Merci. Charlotte',
   NULL,
   jsonb_build_object(
     'client_first_name', 'Charlotte',
     'client_last_name', 'Fournier',
     'email', 'charlotte.fournier@example.com',
     'phone', '06 23 45 09 87',
     'requested_date', to_char(CURRENT_DATE + INTERVAL '5 days', 'YYYY-MM-DD'),
     'requested_time', '18:00',
     'treatment_match', jsonb_build_object('id', '00000000-0000-0000-0000-000000000027', 'confidence', 0.96),
     'variant_match',   jsonb_build_object('id', '00000000-0000-0000-0000-000000000330', 'confidence', 0.94),
     'guest_count', 1,
     'notes', NULL,
     'intent_confidence', 0.95,
     'detected_language', 'fr'
   ),
   0.95, 'converted', '00000000-0000-0000-0000-000000000212', NULL, '<seed-inq-406@example.com>', NOW() - INTERVAL '2 days'),

  -- H) Orphan — alias inconnu (pas de venue), traité comme failed
  ('00000000-0000-0000-0000-000000000407',
   NULL,
   'curious.visitor@example.com',
   'unknown-venue@booking.eia.fr',
   'Hello?',
   E'Hi, is this address active?',
   NULL,
   NULL, NULL, 'failed', NULL, 'Unknown venue alias or unconfigured domain', '<seed-inq-407@example.com>', NOW() - INTERVAL '4 days');
