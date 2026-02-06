-- =============================================================
-- SEED DATA FOR LOCAL DEVELOPMENT ONLY
-- Run: supabase db reset (auto-executes after migrations)
-- =============================================================

-- Fixed UUIDs for predictability
-- Admin:       00000000-0000-0000-0000-000000000001
-- Hairdresser: 00000000-0000-0000-0000-000000000002
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
    'hairdresser@oom.dev',
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
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000000002', 'email', 'hairdresser@oom.dev'),
    'email',
    '00000000-0000-0000-0000-000000000002',
    NOW(), NOW(), NOW()
  );

-- 3) Test hotel
INSERT INTO public.hotels (id, name, status, opening_time, closing_time, timezone)
VALUES (
  '00000000-0000-0000-0000-000000000010',
  'Hotel Dev Test',
  'Actif',
  '08:00',
  '20:00',
  'Europe/Paris'
);

-- 4) Admin record
INSERT INTO public.admins (id, user_id, email, first_name, last_name, phone, status, country_code)
VALUES (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  'admin@oom.dev',
  'Dev', 'Admin',
  '0600000001',
  'Actif',
  '+33'
);

-- 5) Hairdresser record
INSERT INTO public.hairdressers (id, user_id, email, first_name, last_name, phone, status, password_set, country_code)
VALUES (
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000002',
  'hairdresser@oom.dev',
  'Dev', 'Hairdresser',
  '0600000002',
  'Actif',
  true,
  '+33'
);

-- 6) Link hairdresser to test hotel
INSERT INTO public.hairdresser_hotels (id, hairdresser_id, hotel_id)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000010'
);

-- 7) User roles
INSERT INTO public.user_roles (id, user_id, role)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'admin'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 'hairdresser');
