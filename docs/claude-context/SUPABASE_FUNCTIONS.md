# Eïa - Supabase Edge Functions

> **Note legacy** : Les noms de fonctions utilisent encore "hairdresser" (OOM). Dans le contexte Eïa, lire "thérapeute" à chaque occurrence de "hairdresser/coiffeur".

## Vue d'ensemble

40+ Edge Functions Supabase (Deno) situées dans `supabase/functions/`.
Toutes requièrent JWT verification sauf indication contraire.
Code partagé dans `supabase/functions/_shared/` (templates email, helpers WhatsApp, etc.).

## Fonctions de Booking

| Fonction | Description |
|----------|-------------|
| `create-client-booking` | Crée une réservation client complète |
| `get-availability` | Disponibilité d'un lieu — mode date (`{ availableSlots }`) ou plage (`{ daysWithSlots }`). Logique unique dans `_shared/availability-query.ts` |
| `validate-booking-slot` | Valide un créneau avant confirmation |
| `check-expired-slots` | Nettoie les réservations de créneaux expirées |
| `accept-booking` | Thérapeute accepte une réservation |
| `decline-booking` | Thérapeute refuse une réservation |
| `handle-booking-cancellation` | Notifs internes annulation (thérapeute, admins push, Slack) — invoqué par `cancel-booking` |
| `cancel-booking` | Annulation + remboursement Stripe (si `paid`) + emails/SMS client + recap email admins |
| `complete-booking` | Marque une réservation terminée |
| `assign-hairdresser` | Assigne un thérapeute à une réservation _(nom legacy)_ |
| `propose-alternative` | Propose des créneaux alternatifs |
| `handle-quote-response` | Traite la réponse client à un devis |
| `mark-tap-to-pay-paid` | Marque un RDV payé par tap-to-pay |

## Fonctions de Paiement (Stripe)

| Fonction | Description |
|----------|-------------|
| `create-checkout-session` | Crée session Stripe Checkout |
| `stripe-webhook` | Webhook Stripe (paiements, refunds) — `verify_jwt = false` |
| `finalize-payment` | Finalise un paiement après redirect Stripe |
| `handle-checkout-success` | Handler succès Stripe Checkout |
| `send-payment-link` | Envoie lien de paiement au client |
| `create-connect-account` | Crée compte Stripe Connect pour thérapeute |
| `create-stripe-connect-account` | Alternative création Stripe Connect |
| `generate-onboarding-link` | Lien onboarding Stripe Connect |
| `generate-stripe-login-link` | Lien dashboard Stripe Connect Express |
| `stripe-connect-webhook` | Webhook événements Stripe Connect |
| `process-payout` | Traite un payout vers thérapeute |
| `generate-monthly-invoices` | Génère factures mensuelles (hôtels + thérapeutes) |
| `get-hairdresser-earnings` | Calcule gains et commissions thérapeute _(nom legacy)_ |
| `generate-invoice` | Génère facture PDF pour un booking |

## Fonctions de Notification

| Fonction | Description |
|----------|-------------|
| `send-push-notification` | Envoie notification push (OneSignal) |
| `trigger-new-booking-notifications` | Orchestre toutes les notifs nouveau booking |
| `trigger-booking-cancelled-notification` | Orchestre les notifs annulation |
| `notify-admin-new-booking` | Notifie admin d'un nouveau RDV |
| `notify-admin-quote-pending` | Notifie admin d'un devis en attente |
| `notify-booking-confirmed` | Confirmation booking au thérapeute |
| `notify-concierge-booking` | Notifie concierge d'un booking |
| `notify-concierge-completion` | Notifie concierge quand soin terminé |
| `notify-concierge-room-payment` | Notifie concierge d'un paiement en chambre |
| `send-slack-notification` | Alerte Slack interne |

## Fonctions d'Email

| Fonction | Description |
|----------|-------------|
| `send-booking-confirmation` | Email confirmation réservation au client |
| `send-booking-reminder` | Email rappel réservation |
| `send-rating-email` | Email demande de note post-soin |
| `send-quote-email` | Email devis (prix sur demande) |
| `send-treatment-request-email` | Email demande de soin |
| `contact-admin` | Formulaire contact client → admin |

## Fonctions WhatsApp

| Fonction | Description |
|----------|-------------|
| `send-booking-whatsapp` | Envoie message WhatsApp booking |
| `whatsapp-meta-webhook` | Webhook entrant WhatsApp Meta |

## Fonctions d'Invitation

| Fonction | Description |
|----------|-------------|
| `invite-hairdresser` | Invite un thérapeute _(nom legacy, à renommer `invite-therapist`)_ |
| `invite-concierge` | Invite un concierge |
| `invite-admin` | Invite un admin |
| `resend-invite` | Renvoie une invitation |
| `verify-invite-token` | Vérifie token d'invitation |

## Fonctions Auth & Utilisateur

| Fonction | Description |
|----------|-------------|
| `send-otp` | Envoie OTP par SMS |
| `verify-otp` | Vérifie code OTP |
| `ensure-user-role` | Assigne un rôle à un utilisateur |
| `check-admin-exists` | Vérifie si un compte admin existe |
| `delete-admin` | Supprime un compte admin |

## Fonctions Admin / Venue

| Fonction | Description |
|----------|-------------|
| `create-hotel` | Crée un lieu (hôtel/spa) |
| `update-hotel` | Met à jour un lieu |
| `generate-hotel-qr` | Génère QR code pour un lieu |

## Fonctions Utilitaires

| Fonction | Description |
|----------|-------------|
| `generate-vapid-keys` | Génère clés VAPID pour Web Push |
| `get-vapid-public-key` | Retourne clé publique VAPID |
| `test-push-notifications` | Test envoi push |
| `test-onesignal` | Test intégration OneSignal |

## Appel depuis le Frontend

```typescript
// Via lib helper (recommandé)
import { invokeEdgeFunction } from '@/lib/supabaseEdgeFunctions';
const result = await invokeEdgeFunction('function-name', { body: payload });

// skipAuth pour fonctions publiques (client booking)
const result = await invokeEdgeFunction('function-name', {
  body: payload,
  skipAuth: true
});
```

### `cancel-booking`

- **JWT** : `verify_jwt = false`. Staff : `bookingId` + Bearer + contrôle `permissions.ts`. Client public : `token` (short_token ou UUID) via `invokeEdgeFunction` avec `skipAuth: true`.
- **Permissions** (`permissions.ts`) : admin (tous venues + frais d'annulation), concierge (venues assignés), thérapeute (booking assigné ou `booking_therapists` accepted). Tout autre user authentifié → 403.
- **Stripe** (`stripe-settlement.ts`) :
  - `paid` + PaymentIntent : annulation PI `requires_capture`, capture partielle (frais), ou `refunds.create` si `succeeded`.
  - PI `requires_capture` même si `payment_status` pas encore `paid` (chemin défensif).
  - `pending` / `card_saved` / `awaiting_payment` : annulation du SetupIntent (libération empreinte), pas de remboursement.
  - `charged_to_room` / `partner_billed` : pas d'action Stripe.
  - Erreurs Stripe idempotentes (`already_canceled`, refund déjà créé) traitées comme succès.
- **SMS client** : même garde que la confirmation (`paid`, `card_saved`, `charged_to_room`, etc.) — pas si `awaiting_payment`.
- **Emails** : client + recap admins actifs, langue `bookings.language` (`notifications.ts`, `i18n.ts`).
- **Politique venue** : texte custom `hotels.cancellation_policy_text_fr/en` affiché dans la modale ; sinon tranches client (`cancellation_tiers` + `client_cancellation_cutoff_hours`) ou frais admin (`cancellation_fee_type` / `cancellation_fee_amount`).
- **Client (token)** : cutoff dynamique par venue ; remboursement selon tranches (`_shared/cancellation-tiers.ts`). Pas de `custom_cancellation_fee_amount`.
- **Admin** : body optionnel `custom_cancellation_fee_amount` (€, prioritaire) ou `charge_late_fee` + politique venue fixe/%.
- **Audit DB** :
  - `bookings` : `status = cancelled`, `cancellation_reason` (motif métier).
  - `booking_payment_infos` : `cancelled_at`, `cancelled_by` (NULL si annulation token public), `cancellation_fee_amount`, `refund_amount`, `stripe_refund_id` — cycle de vie financier sur le même record que `estimated_price` / carte / PI.
  - `booking_payment_infos.cancellation_reason` reste réservé aux annulations techniques paiement (ex. lien expiré), pas au motif utilisateur.

**Tests manuels (checklist PR)** :

| Scénario | Attendu |
|----------|---------|
| `card_saved` (client manage-booking) | SetupIntent annulé, pas de remboursement, email/SMS si notif cochée |
| `paid` + capture complète | Refund total sur carte |
| `paid` + frais admin | Capture partielle ou refund partiel selon état PI |
| `partner_billed` | Pas d'appel Stripe |
| `charged_to_room` | Pas d'appel Stripe |
| Concierge | Pas de checkbox frais d'annulation |
| Admin | Frais libres (`custom_cancellation_fee_amount`) ou politique venue (`charge_late_fee`) |
| Client &lt; cutoff | 400, message cutoff |
| Client entre tranches | Remboursement % acompte selon `cancellation_tiers` |
| Thérapeute PWA | Annule uniquement ses bookings (403 sinon) |
| Token manage-booking sans login | Annulation OK (`verify_jwt = false` + token body) |

## Variables d'Environnement Requises

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `ONESIGNAL_APP_ID`
- `ONESIGNAL_API_KEY`
- `RESEND_API_KEY` (emails)

## Renommages de Fonctions à Prévoir

| Nom actuel | Nom cible | Raison |
|------------|-----------|--------|
| `invite-hairdresser` | `invite-therapist` | Terminologie Eïa |
| `assign-hairdresser` | `assign-therapist` | Terminologie Eïa |
| `get-hairdresser-earnings` | `get-therapist-earnings` | Terminologie Eïa |
| Toute fonction contenant "hairdresser" | Équivalent "therapist" | Cohérence naming |
