# OOM Hotel - Business Logic

## Flux de Réservation Client

```
1. Welcome Page (/client/:hotelId)
   └── Affiche infos hôtel, vidéo intro

2. Treatments (/client/:hotelId/treatments)
   └── Browse soins par catégorie
   └── Ajouter au panier (CartContext)
   └── Panier persisté en sessionStorage

3. Schedule (/client/:hotelId/schedule)
   └── Sélection date (vérifie venue_deployment_schedules)
   └── Sélection créneau horaire
   └── Sélection coiffeur (optionnel)

4. Guest Info (/client/:hotelId/guest-info)
   └── Nom, prénom, téléphone, email
   └── Numéro de chambre
   └── Note optionnelle

5. Payment (/client/:hotelId/payment)
   └── Choix méthode : Stripe ou "Pay at hotel"

6. Checkout (/client/:hotelId/checkout)
   └── Récapitulatif complet
   └── Confirmation
   └── Appel create-client-booking

7. Confirmation (/client/:hotelId/confirmation/:bookingId)
   └── Détails réservation
   └── Email de confirmation envoyé
```

## Cycle de Vie d'une Réservation

```
┌─────────────┐
│   pending   │ ← Création initiale
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│  confirmed  │ ←── │ auto_validate│ (si 1 seul coiffeur)
└──────┬──────┘     └─────────────┘
       │
       ├───────────────┐
       ▼               ▼
┌─────────────┐  ┌─────────────┐
│  completed  │  │  cancelled  │
└─────────────┘  └─────────────┘
```

### Statuts de Booking

| Statut | Description |
|--------|-------------|
| `pending` | Créée, en attente d'assignation coiffeur |
| `confirmed` | Coiffeur assigné et confirmé |
| `completed` | Service effectué |
| `cancelled` | Annulée (par client, admin ou système) |

### Auto-validation

Si `hotels.auto_validate_bookings = true` et qu'un seul coiffeur est assigné à l'hôtel :
- La réservation passe directement de `pending` à `confirmed`
- Le coiffeur est automatiquement assigné

## Système de Commission

### Calcul des montants

```
Prix total (TTC) = Σ(prix soins)

Commission coiffeur = Prix total × (hairdresser_commission / 100)
Commission hôtel = Prix total × (hotel_commission / 100)
Commission OOM = Prix total - Commission coiffeur - Commission hôtel

TVA = Prix total × (vat / 100)
```

### Exemple

```
Prix total: 100€
hairdresser_commission: 70%
hotel_commission: 10%
vat: 20%

→ Coiffeur reçoit: 70€
→ Hôtel reçoit: 10€
→ OOM reçoit: 20€
→ TVA collectée: 20€
```

## Gestion des Disponibilités

### venue_deployment_schedules

Trois types de planning :

1. **always_open** : L'hôtel est toujours disponible
2. **specific_days** : Jours spécifiques de la semaine
   - `days_of_week[]` : [1,3,5] = Lundi, Mercredi, Vendredi
   - `recurring_start_date` / `recurring_end_date` : Période
   - `recurrence_interval` : Toutes les N semaines
3. **one_time** : Dates ponctuelles
   - `specific_dates[]` : ["2024-02-15", "2024-02-22"]

### Vérification disponibilité

```sql
-- Fonction RPC
is_venue_available_on_date(hotel_id, check_date) → boolean

-- Récupère dates disponibles
get_venue_available_dates(hotel_id, start_date, end_date) → date[]
```

## Gestion des Coiffeurs

### Assignation

1. Réservation créée → Notif push à tous les coiffeurs de l'hôtel
2. Premier coiffeur qui accepte → Assigné
3. Si coiffeur refuse → Ajouté à `declined_by[]`
4. Si tous refusent → Admin notifié

### Stripe Connect

1. Coiffeur s'inscrit → Création compte Stripe Connect
2. Onboarding Stripe → `stripe_onboarding_completed = true`
3. À chaque booking terminé → Payout automatique via Stripe Transfer

## Soins "Prix sur Demande"

Pour les soins avec `price_on_request = true` :

1. Client demande un devis via `treatment_requests`
2. Admin reçoit la demande
3. Admin définit `quoted_price` et `quoted_duration`
4. Email avec lien de devis envoyé au client
5. Client accepte → Réservation créée (`converted_booking_id`)

## Notifications Push (OneSignal)

### Événements déclencheurs

| Événement | Destinataire | Message |
|-----------|--------------|---------|
| Nouvelle réservation | Coiffeurs de l'hôtel | "Nouvelle réservation disponible" |
| Booking accepté | Client | "Votre réservation est confirmée" |
| Booking annulé | Coiffeur/Client | "Réservation annulée" |
| Rappel J-1 | Client | "Rappel de votre RDV demain" |
| Demande de note | Client | "Notez votre expérience" |

## Trunks (Équipements)

Les "trunks" sont des malles/équipements mobiles :
- Assignés à un hôtel spécifique
- Peuvent être liés à une réservation (`bookings.trunk_id`)
- Tracking du statut et prochaine utilisation

## Tokens de Sécurité

| Token | Usage |
|-------|-------|
| `quote_token` | Validation devis par le client |
| `rating_token` | Lien unique pour noter le coiffeur |
| `invite_token` | Invitation coiffeur/concierge/admin |

## Internationalisation

- Langues supportées : FR, EN
- Détection automatique via navigateur
- Stockage préférence utilisateur
- Fichiers : `src/i18n/locales/{fr,en}.json`
