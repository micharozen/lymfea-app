-- =============================================================
-- SEED DATA FOR LOCAL DEVELOPMENT ONLY
-- Run: supabase db reset (auto-executes after migrations)
-- =============================================================

-- Fixed UUIDs for predictability
-- Admin:       00000000-0000-0000-0000-000000000001
-- Therapist F: 00000000-0000-0000-0000-000000000002
-- Therapist M: 00000000-0000-0000-0000-000000000004
-- Concierge:   00000000-0000-0000-0000-000000000003
-- Hotel:       00000000-0000-0000-0000-000000000010

-- 1) Auth users (password: "password" for all)
-- GoTrue requires empty strings (not NULL) for token/change columns
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

-- 2) Identity records (required for signInWithPassword)
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
INSERT INTO public.hotels (id, name, status, opening_time, closing_time, timezone, address, city, country, postal_code, landing_subtitle, venue_type, currency, slot_interval, country_code)
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
  'FR'
);

-- 4) Admin record
INSERT INTO public.admins (id, user_id, email, first_name, last_name, phone, status, country_code)
VALUES (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  'admin@oom.dev',
  'Michael', 'Admin',
  '0600000001',
  'Actif',
  '+33'
);

-- 5) Therapist records (female + male for gender preference testing)
INSERT INTO public.therapists (id, user_id, email, first_name, last_name, phone, status, password_set, country_code, minimum_guarantee, skills, gender, trunks)
VALUES
  (
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000002',
    'therapist@lymfea.dev',
    'Dev', 'Therapist',
    '0600000002',
    'Actif',
    true,
    '+33',
    '{"1": 3, "2": 2, "3": 4, "4": 3, "5": 2, "6": 1, "0": 0}',
    '{men,women,barber,beauty}',
    'female',
    '00000000-0000-0000-0000-000000000030'
  ),
  (
    '00000000-0000-0000-0000-000000000104',
    '00000000-0000-0000-0000-000000000004',
    'therapist-m@lymfea.dev',
    'Marc', 'Therapist',
    '0600000004',
    'Actif',
    true,
    '+33',
    '{"1": 3, "2": 2, "3": 4, "4": 3, "5": 2, "6": 1, "0": 0}',
    '{men,women,barber,beauty}',
    'male',
    '00000000-0000-0000-0000-000000000031'
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

-- 7) Link concierge to test hotel (used by UserContext to load hotelIds)
INSERT INTO public.concierge_hotels (id, concierge_id, hotel_id)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000103',
  '00000000-0000-0000-0000-000000000010'
);

-- 8) Link therapists to test hotel
INSERT INTO public.therapist_venues (id, therapist_id, hotel_id)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000010'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000010');

-- 9) Treatment categories + treatments for test hotel
INSERT INTO public.treatment_categories (id, name, hotel_id, sort_order)
VALUES
  ('00000000-0000-0000-0000-000000000020', 'Massage', '00000000-0000-0000-0000-000000000010', 1),
  ('00000000-0000-0000-0000-000000000022', 'Soins visage', '00000000-0000-0000-0000-000000000010', 2),
  ('00000000-0000-0000-0000-000000000023', 'Soins corps', '00000000-0000-0000-0000-000000000010', 3);

INSERT INTO public.treatment_menus (id, name, category, hotel_id, service_for, duration, price, currency, status, description, is_bestseller)
VALUES
  ('00000000-0000-0000-0000-000000000021', 'Massage relaxant', 'Massage', '00000000-0000-0000-0000-000000000010', 'All', 60, 90.00, 'EUR', 'active', 'Massage aux huiles essentielles pour une relaxation profonde', true),
  ('00000000-0000-0000-0000-000000000024', 'Deep tissue', 'Massage', '00000000-0000-0000-0000-000000000010', 'All', 75, 120.00, 'EUR', 'active', 'Massage en profondeur pour soulager les tensions musculaires', false),
  ('00000000-0000-0000-0000-000000000025', 'Soin éclat visage', 'Soins visage', '00000000-0000-0000-0000-000000000010', 'All', 45, 75.00, 'EUR', 'active', 'Nettoyage, gommage et masque pour un teint lumineux', true),
  ('00000000-0000-0000-0000-000000000026', 'Gommage corps', 'Soins corps', '00000000-0000-0000-0000-000000000010', 'All', 30, 55.00, 'EUR', 'active', 'Exfoliation douce au sel marin et huile d''argan', false),
  ('00000000-0000-0000-0000-000000000027', 'Enveloppement détox', 'Soins corps', '00000000-0000-0000-0000-000000000010', 'All', 50, 85.00, 'EUR', 'active', 'Enveloppement aux algues pour purifier et revitaliser', true);

-- 10) Treatment rooms assigned to test hotel
INSERT INTO public.treatment_rooms (id, name, room_number, room_type, status, hotel_id, hotel_name, capacity)
VALUES
  ('00000000-0000-0000-0000-000000000030', 'Salle de Massage #1', 'ROOM-DEV-001', 'Massage', 'Actif', '00000000-0000-0000-0000-000000000010', 'Hôtel Hana', 1),
  ('00000000-0000-0000-0000-000000000031', 'Salle de Massage #2', 'ROOM-DEV-002', 'Massage', 'Actif', '00000000-0000-0000-0000-000000000010', 'Hôtel Hana', 1);

-- 11) Venue deployment schedule (always open)
INSERT INTO public.venue_deployment_schedules (id, hotel_id, schedule_type, recurrence_interval)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000010',
  'always_open',
  1
);

-- 12) User roles
INSERT INTO public.user_roles (id, user_id, role)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'admin'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 'therapist'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000003', 'concierge'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000004', 'therapist');
