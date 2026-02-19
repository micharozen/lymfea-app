# Lymfea - Database Schema

> **Note legacy** : Ce schéma provient du fork OOM (coiffure). Les noms de tables/colonnes utilisent encore la terminologie OOM (hairdresser, trunk, etc.). Voir la section "Adaptation Lymfea" en bas pour le mapping complet.

## Tables Principales

### Users & Authentication

**`profiles`**
- `id`, `user_id`, `timezone` (default: Europe/Paris), `created_at`, `updated_at`

**`user_roles`**
- `id`, `user_id`, `role` (enum: admin|moderator|user|concierge|hairdresser)
- Note : `hairdresser` = thérapeute dans le contexte Lymfea

**`admins`**
- `id`, `user_id`, `email`, `first_name`, `last_name`, `phone`, `country_code`, `profile_image`, `status`

**`concierges`**
- `id`, `user_id`, `email`, `first_name`, `last_name`, `phone`, `country_code`, `hotel_id` (nullable), `profile_image`, `status`, `must_change_password`

**`hairdressers`** ➜ _Lymfea : thérapeutes_
- `id`, `user_id`, `email`, `first_name`, `last_name`, `phone`, `country_code`, `profile_image`
- `skills[]` — spécialisations (massage, soin visage, etc.)
- `status` (default: 'pending'), `password_set`
- `stripe_account_id`, `stripe_onboarding_completed` — paiements Stripe Connect
- `trunks` (text) — legacy, à supprimer

### Venues

**`hotels`** ➜ _Lymfea : lieux (hôtels avec spa / spas indépendants)_
- `id`, `name`, `image`, `cover_image`, `address`, `city`, `country`, `country_code`, `postal_code`
- `timezone`, `opening_time`, `closing_time`
- `venue_type` (text CHECK: hotel|coworking|enterprise|null) — **à migrer vers hotel|spa**
- `currency`, `vat`
- `hairdresser_commission` — commission thérapeute (%)
- `hotel_commission` — commission lieu (%)
- `status`, `auto_validate_bookings`
- `slot_interval` (integer, default: 30) — intervalle de créneaux en minutes
- `offert` (bool) — mode gratuit (prix masqués)
- `company_offered` (bool) — entreprise paie, client ne paie pas
- `description`, `landing_subtitle`

**`venue_deployment_schedules`** (1-to-1 avec hotels)
- `id`, `hotel_id`, `schedule_type` (enum: always_open|specific_days|one_time)
- `days_of_week[]`, `recurring_start_date`, `recurring_end_date`
- `specific_dates[]`, `recurrence_interval`

**`venue_blocked_slots`** — créneaux bloqués (pause déjeuner, nettoyage, etc.)
- `id`, `hotel_id`, `label`, `start_time`, `end_time`
- `days_of_week[]` (nullable — NULL = tous les jours)
- `is_active` (bool)

### Bookings & Treatments

**`bookings`**
- `id`, `booking_id` (auto-increment humain), `hotel_id`, `hotel_name` (dénormalisé)
- `hairdresser_id` ➜ _thérapeute assigné_, `hairdresser_name` (dénormalisé)
- `trunk_id` ➜ _salle de soin assignée_
- `booking_date`, `booking_time`, `duration`, `status`
- `total_price`, `payment_method` (room|card|tap_to_pay|offert), `payment_status`
- `stripe_invoice_url`, `payment_link_url`, `payment_link_sent_at`, `payment_link_channels[]`
- `client_first_name`, `client_last_name`, `client_email`, `phone`, `room_number`
- `client_note`, `client_signature`, `signed_at`
- `assigned_at`, `declined_by[]`, `quote_token`, `cancellation_reason`

Statuts : `pending` → `confirmed` → `ongoing` → `completed` | `cancelled` | `noshow`

**`treatment_menus`** — catalogue de soins par lieu
- `id`, `hotel_id`, `name`, `category`, `service_for` (men|women|unisex)
- `description`, `duration`, `price`, `price_on_request`, `currency`
- `image`, `lead_time` (minutes de préavis), `status`, `sort_order`
- `is_bestseller` (bool)

**`treatment_categories`**
- `id`, `name`, `hotel_id`, `sort_order`
- Unique sur (`name`, `hotel_id`)

**`booking_treatments`** (junction table)
- `id`, `booking_id`, `treatment_id`

**`booking_proposed_slots`** (proposition de créneaux alternatifs)
- `id`, `booking_id` (unique)
- `slot_1_date/time` (requis), `slot_2_date/time`, `slot_3_date/time` (optionnels)
- `validated_slot` (1|2|3), `validated_by`, `validated_at`
- `expires_at` (default: +2h)

**`booking_alternative_proposals`** (contre-propositions thérapeute)
- `id`, `booking_id`, `hairdresser_id`
- `original_date/time`, `alternative_1_date/time`, `alternative_2_date/time`
- `status`, `current_offer_index`, `whatsapp_message_id`, `client_phone`
- `expires_at` (default: +24h)

**`treatment_requests`** (demandes de devis pour soins "prix sur demande")
- `id`, `hotel_id`, `client_*` fields, `treatment_id`
- `preferred_date/time`, `quoted_duration`, `quoted_price`
- `status`, `admin_notes`, `converted_booking_id`

### Junction Tables

**`concierge_hotels`** : `concierge_id` ↔ `hotel_id`
**`hairdresser_hotels`** ➜ _thérapeute ↔ lieu_ : `hairdresser_id` ↔ `hotel_id`

### Equipment ➜ Salles de soin

**`trunks`** ➜ _Lymfea : salles de soin / cabines_
- `id`, `trunk_id` ➜ _numéro de salle_, `trunk_model` ➜ _type de salle_, `name`
- `hotel_id`, `hotel_name` (dénormalisé), `hairdresser_name` (dénormalisé)
- `next_booking`, `image`, `status`

### Financial

**`hairdresser_payouts`** ➜ _paiements thérapeutes_
- `id`, `booking_id`, `hairdresser_id`, `amount`, `status`, `stripe_transfer_id`, `error_message`

**`hotel_ledger`** ➜ _grand livre lieu_
- `id`, `hotel_id`, `booking_id`, `amount`, `description`, `status`

### Ratings & Notifications

**`hairdresser_ratings`** ➜ _notes thérapeutes_
- `id`, `booking_id`, `hairdresser_id`, `rating` (1-5), `comment`, `rating_token`

**`notifications`**
- `id`, `user_id`, `booking_id`, `type`, `message`, `read`

**`push_subscriptions`** / **`push_tokens`** / **`push_notification_logs`**

### Analytics

**`client_analytics`**
- `id`, `session_id`, `hotel_id`
- `event_type` (page_view|action|conversion), `event_name`
- `page_path`, `referrer`, `metadata` (jsonb), `device_type`

### Security

**`otp_rate_limits`**
- `phone_number`, `request_type`, `attempt_count`, `blocked_until`

## Enums

```sql
app_role: "admin" | "moderator" | "user" | "concierge" | "hairdresser"
schedule_type: "always_open" | "specific_days" | "one_time"
venue_type: "hotel" | "coworking" | "enterprise"  -- CHECK constraint (pas un enum PG)
```

## Relations Principales

```
hotels (1) ←→ (n) concierge_hotels ←→ (1) concierges
hotels (1) ←→ (n) hairdresser_hotels ←→ (1) hairdressers [thérapeutes]
hotels (1) ←→ (n) treatment_menus
hotels (1) ←→ (n) treatment_categories
hotels (1) ←→ (n) bookings
hotels (1) ←→ (1) venue_deployment_schedules
hotels (1) ←→ (n) venue_blocked_slots
hotels (1) ←→ (n) trunks [salles de soin]

bookings (1) ←→ (n) booking_treatments ←→ (1) treatment_menus
bookings (1) ←→ (1) booking_proposed_slots
bookings (1) ←→ (n) booking_alternative_proposals
bookings (1) ←→ (n) hairdresser_payouts
bookings (1) ←→ (1) hairdresser_ratings
bookings (n) ←→ (0-1) trunks [salle assignée]
```

## Fonctions RPC Importantes

| Fonction | Description |
|----------|-------------|
| `has_role(role, user_id)` | Vérifie si un user a un rôle |
| `get_public_hotels()` | Liste publique des lieux |
| `get_public_hotel_by_id(hotel_id)` | Détails lieu avec schedule et venue_type |
| `get_public_treatments(hotel_id)` | Soins disponibles pour un lieu |
| `get_public_hairdressers(hotel_id)` | Thérapeutes publics (nom, image, skills) |
| `accept_booking(booking_id, hairdresser_id, name, price)` | Thérapeute accepte un RDV |
| `unassign_booking(booking_id, hairdresser_id)` | Thérapeute refuse/désassigné |
| `is_venue_available_on_date(hotel_id, date)` | Vérifie disponibilité d'un lieu |
| `get_venue_available_dates(hotel_id, start, end)` | Dates disponibles sur une période |
| `get_concierge_hotels(user_id)` | Lieux d'un concierge |
| `get_hairdresser_id(user_id)` | ID thérapeute d'un user |
| `get_enterprise_session_data(hotel_id, date)` | Données dashboard journée |
| `get_client_funnel(hotel_id, start, end)` | Analytics funnel client |

## Row-Level Security (RLS)

- Les fonctions `get_public_*` utilisent `SECURITY DEFINER` pour bypass RLS sur données publiques
- Les tables bookings, treatments, etc. ont des politiques RLS basées sur `user_id` et `hotel_id`
- `client_analytics` autorise les INSERT anonymes

---

## Adaptation Lymfea — Changements Data Model à Prévoir

### 1. venue_type

**Changement** : Supprimer `coworking` et `enterprise`, ajouter `spa`.

```sql
-- Migration à créer
ALTER TABLE hotels DROP CONSTRAINT hotels_venue_type_check;
ALTER TABLE hotels ADD CONSTRAINT hotels_venue_type_check
  CHECK (venue_type IN ('hotel', 'spa'));

-- Mettre à jour les données existantes
UPDATE hotels SET venue_type = 'hotel' WHERE venue_type IN ('coworking', 'enterprise');
```

**Frontend** : Mettre à jour `useVenueTerms.ts` pour supporter `hotel` + `spa` au lieu de `hotel` + `coworking` + `enterprise`.

### 2. Renommages de tables et colonnes

Ces renommages seront faits via des migrations SQL. Ils impactent aussi les RPC, les Edge Functions, et le code frontend.

| Actuel | Nouveau | Impact |
|--------|---------|--------|
| `hairdressers` | `therapists` | Table + toutes les FK + RPC + Edge Functions |
| `hairdresser_id` (bookings) | `therapist_id` | Colonne + requêtes frontend |
| `hairdresser_hotels` | `therapist_venues` | Table + jointures |
| `hairdresser_payouts` | `therapist_payouts` | Table + logique Stripe |
| `hairdresser_ratings` | `therapist_ratings` | Table + page notation |
| `hairdresser_commission` (hotels) | `therapist_commission` | Colonne + calcul commissions |
| `hotel_commission` (hotels) | `venue_commission` | Colonne + calcul commissions |
| `app_role: 'hairdresser'` | `app_role: 'therapist'` | Enum PG + guards frontend |

### 3. Transformation trunks → salles de soin

La table `trunks` représente actuellement des malles mobiles de coiffure. Pour Lymfea, elle sera transformée en table de **salles de soin / cabines**.

**Colonnes à adapter :**

| Actuel | Nouveau | Description |
|--------|---------|-------------|
| `trunk_id` | `room_number` | Identifiant humain de la salle |
| `trunk_model` | `room_type` | Type : massage, hammam, jacuzzi, facial, etc. |
| (nouveau) | `capacity` | 1 (individuel) ou 2 (couple) |
| `hairdresser_name` | à supprimer | Les salles ne sont pas liées à un thérapeute fixe |
| `bookings.trunk_id` | `bookings.room_id` | FK vers la salle assignée au RDV |

**Renommage table** : `trunks` → `treatment_rooms`

### 4. Nouvelles tables à créer

**`clients`** — Table persistante de clients (pas de table client actuellement, les infos sont dénormalisées dans bookings)

```
clients:
  id, phone (unique), email, first_name, last_name
  preferred_therapist_id, preferred_treatment_type
  health_notes / contraindications (text)
  language (fr|en)
  created_at, updated_at
```

**Extension `treatment_menus`** :
- `requires_room` (bool) — ce soin nécessite-t-il une cabine dédiée ?
- `body_area` ou `treatment_type` (text) — corps, visage, bien-être, etc.

**`treatment_packages`** — Packages multi-soins (demi-journée spa, journée complète, etc.)

```
treatment_packages:
  id, hotel_id, name, description
  total_duration, total_price, currency
  status, sort_order

package_treatments:
  package_id, treatment_id, sort_order
```

### 5. Tables inchangées

Ces tables sont directement réutilisables sans modification de structure :

- `profiles`, `user_roles`, `admins`, `concierges`
- `venue_deployment_schedules`, `venue_blocked_slots`
- `booking_treatments`, `treatment_categories`
- `booking_proposed_slots`, `booking_alternative_proposals`
- `hotel_ledger`
- `notifications`, `push_subscriptions`, `push_tokens`, `push_notification_logs`
- `client_analytics`
- `otp_rate_limits`
- `treatment_requests`
