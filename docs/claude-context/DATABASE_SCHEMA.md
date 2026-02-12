# OOM Hotel - Database Schema

## Tables Principales

### Users & Authentication

**`profiles`**
- `id`, `user_id`, `timezone` (default: Europe/Paris), `created_at`, `updated_at`

**`user_roles`**
- `id`, `user_id`, `role` (enum: admin|moderator|user|concierge|hairdresser)

**`admins`**
- `id`, `user_id`, `email`, `first_name`, `last_name`, `phone`, `country_code`, `profile_image`, `status`

**`concierges`**
- `id`, `user_id`, `email`, `first_name`, `last_name`, `phone`, `country_code`, `hotel_id` (nullable), `profile_image`, `status`, `must_change_password`

**`hairdressers`**
- `id`, `user_id`, `email`, `first_name`, `last_name`, `phone`, `country_code`, `profile_image`, `skills[]`, `status`, `password_set`, `stripe_account_id`, `stripe_onboarding_completed`, `trunks`

### Venues (Hotels/Coworking/Enterprise)

**`hotels`**
- `id`, `name`, `image`, `cover_image`, `address`, `city`, `country`, `country_code`, `postal_code`
- `timezone`, `opening_time`, `closing_time`
- `venue_type` (enum: hotel|coworking|enterprise|null)
- `currency`, `vat`, `hairdresser_commission`, `hotel_commission`
- `status`, `auto_validate_bookings`

**`venue_deployment_schedules`** (1-to-1 avec hotels)
- `id`, `hotel_id`, `schedule_type` (enum: always_open|specific_days|one_time)
- `days_of_week[]`, `recurring_start_date`, `recurring_end_date`
- `specific_dates[]`, `recurrence_interval`

### Bookings & Treatments

**`bookings`**
- `id`, `booking_id` (auto-increment), `hotel_id`, `trunk_id`, `hairdresser_id`
- `booking_date`, `booking_time`, `status`, `duration`, `total_price`
- `payment_method`, `payment_status`, `stripe_invoice_url`
- `client_first_name`, `client_last_name`, `client_email`, `phone`, `room_number`
- `client_note`, `client_signature`, `signed_at`
- `assigned_at`, `declined_by[]`, `quote_token`, `cancellation_reason`

**`treatment_menus`**
- `id`, `hotel_id`, `name`, `category`, `service_for` (men|women|unisex)
- `description`, `duration`, `price`, `price_on_request`, `currency`
- `image`, `lead_time`, `status`, `sort_order`

**`booking_treatments`** (junction table)
- `id`, `booking_id`, `treatment_id`

**`treatment_requests`** (demandes de devis)
- `id`, `hotel_id`, `client_*` fields, `treatment_id`, `preferred_date/time`
- `quoted_duration`, `quoted_price`, `status`, `admin_notes`, `converted_booking_id`

### Junction Tables

**`concierge_hotels`** : `concierge_id` ↔ `hotel_id`
**`hairdresser_hotels`** : `hairdresser_id` ↔ `hotel_id`

### Equipment

**`trunks`** (équipements mobiles)
- `id`, `trunk_id`, `trunk_model`, `name`, `hotel_id`, `hairdresser_name`, `image`, `status`, `next_booking`

### Financial

**`hairdresser_payouts`**
- `id`, `booking_id`, `hairdresser_id`, `amount`, `status`, `stripe_transfer_id`, `error_message`

**`hotel_ledger`**
- `id`, `hotel_id`, `booking_id`, `amount`, `description`, `status`

### Ratings & Notifications

**`hairdresser_ratings`**
- `id`, `booking_id`, `hairdresser_id`, `rating`, `comment`, `rating_token`

**`notifications`**
- `id`, `user_id`, `booking_id`, `type`, `message`, `read`

**`push_subscriptions`** / **`push_tokens`** / **`push_notification_logs`**

### Security

**`otp_rate_limits`**
- `phone_number`, `request_type`, `attempt_count`, `blocked_until`

## Enums

```sql
app_role: "admin" | "moderator" | "user" | "concierge" | "hairdresser"
schedule_type: "always_open" | "specific_days" | "one_time"
venue_type: "hotel" | "coworking" | "enterprise"
```

## Relations Principales

```
hotels (1) ←→ (n) concierge_hotels ←→ (1) concierges
hotels (1) ←→ (n) hairdresser_hotels ←→ (1) hairdressers
hotels (1) ←→ (n) treatment_menus
hotels (1) ←→ (n) bookings
hotels (1) ←→ (1) venue_deployment_schedules

bookings (1) ←→ (n) booking_treatments ←→ (1) treatment_menus
bookings (1) ←→ (n) hairdresser_payouts
bookings (1) ←→ (n) hairdresser_ratings
```

## Fonctions RPC Importantes

| Fonction | Description |
|----------|-------------|
| `has_role(role, user_id)` | Vérifie si un user a un rôle |
| `get_public_hotels()` | Liste publique des hôtels |
| `get_public_hotel_by_id(hotel_id)` | Détails hôtel avec schedule et venue_type |
| `get_public_treatments(hotel_id)` | Soins disponibles pour un hôtel |
| `accept_booking(booking_id, hairdresser_id, name, price)` | Accepter une réservation |
| `unassign_booking(booking_id, hairdresser_id)` | Refuser/désassigner |
| `is_venue_available_on_date(hotel_id, date)` | Vérifie disponibilité |
| `get_venue_available_dates(hotel_id, start, end)` | Dates disponibles |
| `get_concierge_hotels(user_id)` | Hôtels d'un concierge |
| `get_hairdresser_id(user_id)` | ID hairdresser d'un user |

## Row-Level Security (RLS)

- Les fonctions `get_public_*` utilisent `SECURITY DEFINER` pour bypass RLS sur données publiques
- Les tables bookings, treatments, etc. ont des politiques RLS basées sur `user_id` et `hotel_id`
