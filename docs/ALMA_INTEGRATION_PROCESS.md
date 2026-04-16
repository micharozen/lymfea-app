# Alma BNPL — Documentation technique d'intégration

## Vue d'ensemble

Alma est un fournisseur de paiement BNPL (Buy Now Pay Later) français. Il permet aux clients de payer en **2, 3 ou 4 fois sans frais** lors de la réservation de soins en ligne.

L'intégration dans Lymfea est limitée au **flow client public** (`/client/:hotelId/payment`). Le mode retenu est la **redirection vers la page Alma hébergée** (identique au pattern Stripe Checkout existant).

## Architecture de l'intégration

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Payment.tsx                                                        │
│  ├── useAlmaEligibility(total) → alma-check-eligibility             │
│  │   └── Affiche le bouton Alma uniquement si éligible              │
│  ├── AlmaPaymentOption                                              │
│  │   └── Sélection du plan (2x / 3x / 4x) + ventilation            │
│  └── handlePayment('alma')                                          │
│      └── invoke('alma-create-payment') → redirect Alma hosted page  │
│                                                                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND (Supabase Edge Functions)                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  _shared/alma-client.ts                                             │
│  ├── almaFetch(path, init) — HTTP wrapper avec auth                 │
│  ├── createAlmaPayment(payload)                                     │
│  ├── getAlmaPayment(id)                                             │
│  └── checkAlmaEligibility(amount)                                   │
│                                                                     │
│  _shared/mark-booking-paid.ts                                       │
│  └── markBookingAsPaid(supabase, booking, hotel, metadata)          │
│      ├── bookings.payment_status → 'paid'                           │
│      ├── hotel_ledger → commission entries                          │
│      ├── send-booking-confirmation email                            │
│      ├── notify-admin-new-booking                                   │
│      └── trigger-new-booking-notifications                          │
│                                                                     │
│  alma-check-eligibility/index.ts                                    │
│  └── POST /v1/payments/eligibility → plans éligibles                │
│                                                                     │
│  alma-create-payment/index.ts                                       │
│  ├── Validation (prix, horaires, slots)                             │
│  ├── Création booking (awaiting_payment)                            │
│  ├── Création ligne booking_payment_infos (provider: 'alma')        │
│  └── POST /v1/payments → URL de redirection Alma                    │
│                                                                     │
│  alma-webhook/index.ts                                              │
│  ├── Reçoit IPN Alma (payment_id)                                   │
│  ├── Re-fetch GET /v1/payments/:id (vérification)                   │
│  ├── Vérifie state + montant                                        │
│  └── markBookingAsPaid()                                            │
│                                                                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         BASE DE DONNÉES                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  bookings                                                           │
│  ├── payment_method: 'alma' (étendu)                                │
│  └── payment_status: 'awaiting_payment' → 'paid'                    │
│                                                                     │
│  booking_payment_infos                                              │
│  ├── provider: 'alma'                                               │
│  ├── alma_payment_id: 'payment_xxx'                                 │
│  ├── alma_installments_count: 2 | 3 | 4                            │
│  └── payment_status: 'pending' → 'charged'                          │
│                                                                     │
│  hotel_ledger                                                       │
│  └── Commission entries (identiques à Stripe)                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Flow de paiement détaillé

### Étape 1 : Éligibilité (page Payment)

Quand le client arrive sur la page de paiement :

1. Le hook `useAlmaEligibility(total)` est appelé
2. Il invoque l'edge function `alma-check-eligibility` avec le montant du panier
3. L'edge function proxy vers `POST https://api.getalma.eu/v1/payments/eligibility`
4. Alma retourne la liste des plans éligibles (2x, 3x, 4x) avec les montants des échéances
5. Si au moins un plan est éligible, le bouton Alma est affiché

> **Seuils** : Alma gère ses propres seuils d'éligibilité (min ~50€, max ~2000-3000€ selon le merchant). On ne code pas de seuil en dur — on se base sur la réponse de l'API.

### Étape 2 : Sélection du plan

Le composant `AlmaPaymentOption` affiche :
- Les plans éligibles sous forme de boutons radio (ex: 2x 75€, 3x 50€, 4x 37,50€)
- Le montant de la 1ère échéance (prélevée immédiatement)
- Le planning des échéances suivantes

### Étape 3 : Création du paiement

Au clic sur "Confirmer" avec Alma sélectionné :

1. **Frontend** appelle `alma-create-payment` avec les données de réservation + `installmentsCount`
2. **Edge function** :
   - Valide les traitements côté serveur (prix, statut, horaires, slots bloqués)
   - Crée la booking en `awaiting_payment` dans la DB
   - Crée une ligne dans `booking_payment_infos` avec `provider: 'alma'`
   - Appelle `POST /v1/payments` chez Alma avec :
     - `purchase_amount` (en centimes)
     - `installments_count` (2, 3 ou 4)
     - `return_url` → page confirmation Lymfea
     - `ipn_callback_url` → edge function `alma-webhook`
     - `customer` (prénom, nom, email, téléphone)
   - Met à jour `booking_payment_infos.alma_payment_id`
   - Retourne `{ url, bookingId }`
3. **Frontend** redirige le navigateur vers `url` (page hosted Alma)

### Étape 4 : Page de paiement Alma

Le client est redirigé vers la page Alma hébergée où il :
- Voit le récapitulatif et le plan d'échéances
- Saisit ses informations de carte bancaire
- Alma effectue un scoring anti-fraude et solvabilité
- Alma capture la 1ère échéance immédiatement

### Étape 5 : Retour + IPN Alma (en parallèle)

**A. Redirection navigateur** :
- Le client est redirigé vers `return_url` → `/client/:hotelId/confirmation/:bookingId`
- La page de confirmation lit `bookings.payment_status` pour afficher l'état

**B. Webhook IPN** (peut arriver avant ou après la redirection) :
1. Alma envoie un POST sur `ipn_callback_url` avec `{ payment_id }`
2. L'edge function `alma-webhook` :
   - Re-fetch le paiement via `GET /v1/payments/:id` (l'IPN n'est pas signée)
   - Vérifie `state === "in_progress"` (1ère échéance capturée)
   - Vérifie que `purchase_amount` correspond à `bookings.total_price * 100`
   - **Idempotence** : si `booking_payment_infos.payment_status` est déjà `'charged'`, retourne 200 OK sans rien faire
   - Met à jour `bookings.payment_status = 'paid'` et `payment_method = 'alma'`
   - Met à jour `booking_payment_infos.payment_status = 'charged'`
   - Crée les entrées `hotel_ledger` (commission)
   - Envoie l'email de confirmation client
   - Notifie les admins et déclenche les push notifications thérapeutes

### Étape 6 : Après le paiement

Les échéances suivantes sont gérées automatiquement par Alma :
- J+30 : 2ème échéance
- J+60 : 3ème échéance (si P3X/P4X)
- J+90 : 4ème échéance (si P4X)

**Côté Lymfea, rien à gérer** — Alma porte le risque de défaut et gère le recouvrement.

## Sécurité

### Vérification des IPN
L'IPN Alma **n'est pas signée** (contrairement aux webhooks Stripe). La vérification se fait en :
1. Extrayant le `payment_id` du body de l'IPN
2. Re-fetchant le paiement via `GET /v1/payments/:id` avec la clé API secrète
3. Vérifiant le `state` et le `purchase_amount`

> Ne jamais faire confiance au contenu du body de l'IPN seul.

### Protection contre la fraude sur les prix
Les prix sont recalculés côté serveur à partir de la base de données, jamais depuis le frontend.

### Idempotence
Les re-tentatives d'IPN (en cas de timeout ou erreur temporaire) sont gérées via un check de `booking_payment_infos.payment_status` avant toute écriture.

## Scope et limites

### Inclus dans cette intégration
- Paiement en 2x, 3x, 4x sans frais pour le client
- Flow client public uniquement (`/client/:hotelId/payment`)
- Redirect vers page Alma hébergée
- Webhook IPN avec vérification par re-fetch
- Commission & ledger identiques à Stripe

### Hors périmètre
- PWA thérapeute / conciergerie (reste Stripe)
- Achat de bundles (reste Stripe)
- Stripe Connect / payouts thérapeutes (inchangé)
- Remboursements Alma (à ajouter plus tard)
- Widget in-page / badge PaymentPlans (à ajouter plus tard)

## Fichiers créés / modifiés

| Fichier | Type | Description |
|---|---|---|
| `supabase/functions/_shared/alma-client.ts` | Nouveau | Client HTTP Alma |
| `supabase/functions/_shared/mark-booking-paid.ts` | Nouveau | Logique post-paiement partagée |
| `supabase/functions/alma-check-eligibility/index.ts` | Nouveau | Edge function éligibilité |
| `supabase/functions/alma-create-payment/index.ts` | Nouveau | Edge function création paiement |
| `supabase/functions/alma-webhook/index.ts` | Nouveau | Edge function webhook IPN |
| `src/hooks/useAlmaEligibility.ts` | Nouveau | Hook React éligibilité |
| `src/components/client/AlmaPaymentOption.tsx` | Nouveau | Composant bouton Alma |
| `src/pages/client/Payment.tsx` | Modifié | Ajout option Alma |
| `src/i18n/locales/fr/client.json` | Modifié | Traductions FR |
| `src/i18n/locales/en/client.json` | Modifié | Traductions EN |
| `supabase/migrations/*_add_alma_payment.sql` | Nouveau | Migration DB |
| `supabase/config.toml` | Modifié | Déclaration functions |
| `docs/ALMA_PREREQUISITES.md` | Nouveau | Prérequis (ce fichier) |
| `docs/ALMA_INTEGRATION_PROCESS.md` | Nouveau | Documentation processus |
