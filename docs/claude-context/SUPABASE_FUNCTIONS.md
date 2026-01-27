# OOM Hotel - Supabase Edge Functions

## Vue d'ensemble

40+ Edge Functions Supabase (Deno) situées dans `supabase/functions/`.
Toutes requièrent JWT verification sauf indication contraire.

## Fonctions de Booking

| Fonction | Description |
|----------|-------------|
| `create-client-booking` | Crée une réservation client complète |
| `check-availability` | Vérifie disponibilité créneau |
| `accept-booking` | Coiffeur accepte une réservation |
| `decline-booking` | Coiffeur refuse une réservation |
| `cancel-booking` | Annulation de réservation |
| `complete-booking` | Marque une réservation terminée |
| `assign-hairdresser` | Assigne un coiffeur à une réservation |
| `unassign-hairdresser` | Désassigne un coiffeur |

## Fonctions de Paiement (Stripe)

| Fonction | Description |
|----------|-------------|
| `create-checkout-session` | Crée session Stripe Checkout |
| `stripe-webhook` | Webhook Stripe (paiements, refunds) |
| `finalize-payment` | Finalise un paiement |
| `create-payment-intent` | Crée un PaymentIntent |
| `create-stripe-account` | Crée compte Stripe Connect |
| `stripe-account-link` | Lien onboarding Stripe |
| `check-stripe-account` | Vérifie statut compte Stripe |
| `process-payout` | Traite un payout vers coiffeur |
| `generate-monthly-invoices` | Génère factures mensuelles |

## Fonctions de Notification

| Fonction | Description |
|----------|-------------|
| `send-push-notification` | Envoie notification push (OneSignal) |
| `send-otp` | Envoie OTP par SMS |
| `verify-otp` | Vérifie code OTP |
| `subscribe-push` | Inscription aux push |

## Fonctions d'Email

| Fonction | Description |
|----------|-------------|
| `send-booking-confirmation` | Email confirmation réservation |
| `send-booking-reminder` | Email rappel réservation |
| `send-booking-cancelled` | Email annulation |
| `send-rating-request` | Email demande de note |
| `send-quote-email` | Email devis |
| `send-welcome-email` | Email bienvenue |
| `send-password-reset` | Email reset mot de passe |

## Fonctions d'Invitation

| Fonction | Description |
|----------|-------------|
| `send-hairdresser-invite` | Invite un coiffeur |
| `send-concierge-invite` | Invite un concierge |
| `send-admin-invite` | Invite un admin |
| `verify-invite-token` | Vérifie token d'invitation |

## Fonctions Utilisateur

| Fonction | Description |
|----------|-------------|
| `update-profile` | Met à jour profil |
| `update-password` | Change mot de passe |
| `delete-account` | Supprime compte |
| `get-user-hotels` | Récupère hôtels d'un user |

## Fonctions Admin

| Fonction | Description |
|----------|-------------|
| `create-hotel` | Crée un hôtel |
| `update-hotel` | Met à jour hôtel |
| `create-treatment` | Crée un soin |
| `update-treatment` | Met à jour soin |
| `create-trunk` | Crée un trunk |
| `generate-hotel-qr` | Génère QR code hôtel |

## Fonctions Utilitaires

| Fonction | Description |
|----------|-------------|
| `upload-image` | Upload image (Storage) |
| `resize-image` | Redimensionne image |
| `generate-pdf` | Génère PDF (facture) |
| `health-check` | Check santé API |

## Configuration (`supabase/config.toml`)

```toml
[functions.create-client-booking]
verify_jwt = true

[functions.stripe-webhook]
verify_jwt = false  # Webhook Stripe n'a pas de JWT

[functions.send-push-notification]
verify_jwt = true
```

## Appel depuis le Frontend

```typescript
// Via supabase client
const { data, error } = await supabase.functions.invoke('function-name', {
  body: { param1: value1 }
});

// Via lib helper (src/lib/supabaseEdgeFunctions.ts)
import { invokeEdgeFunction } from '@/lib/supabaseEdgeFunctions';
const result = await invokeEdgeFunction('function-name', payload);
```

## Variables d'Environnement Requises

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `ONESIGNAL_APP_ID`
- `ONESIGNAL_API_KEY`
- `RESEND_API_KEY` (emails)
