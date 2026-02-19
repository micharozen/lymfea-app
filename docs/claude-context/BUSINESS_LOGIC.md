# Lymfea - Business Logic

> **Note legacy** : Le code utilise encore la terminologie OOM (hairdresser, trunk, etc.). Voir `CLAUDE.md` section "Legacy Naming" pour le mapping complet.

## Flux de Réservation Client

```
1. Welcome Page (/client/:hotelId)
   └── Affiche infos lieu (hôtel/spa), branding personnalisé

2. Treatments (/client/:hotelId/treatments)
   └── Browse soins par catégorie
   └── Ajouter au panier (CartContext)
   └── Panier persisté en sessionStorage

3. Schedule (/client/:hotelId/schedule)
   └── Sélection date (vérifie venue_deployment_schedules)
   └── Sélection créneau horaire (respecte opening_time/closing_time + venue_blocked_slots)
   └── Sélection thérapeute (optionnel, avec préférence H/F)

4. Guest Info (/client/:hotelId/guest-info)
   └── Nom, prénom, téléphone, email
   └── Numéro de chambre (hôtel uniquement)
   └── Note optionnelle

5. Payment (/client/:hotelId/payment)
   └── Choix méthode : Stripe ou "Facturation en chambre" (hôtel uniquement)

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
│   pending    │ ← Création initiale
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌────────────────┐
│  confirmed  │ ←── │ auto_validate  │ (si 1 seul thérapeute au lieu)
└──────┬──────┘     └────────────────┘
       │
       ├────────────────┬──────────────┐
       ▼                ▼              ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  completed  │  │  cancelled  │  │   noshow    │
└─────────────┘  └─────────────┘  └─────────────┘
```

### Statuts de Booking

| Statut | Description |
|--------|-------------|
| `pending` | Créée, en attente d'assignation thérapeute |
| `confirmed` | Thérapeute assigné et confirmé |
| `ongoing` | Soin en cours |
| `completed` | Soin effectué |
| `cancelled` | Annulée (par client, admin ou système) |
| `noshow` | Client ne s'est pas présenté |

### Auto-validation

Si `hotels.auto_validate_bookings = true` et qu'un seul thérapeute est assigné au lieu :
- La réservation passe directement de `pending` à `confirmed`
- Le thérapeute est automatiquement assigné

## Attribution des Thérapeutes

### Mode broadcast (automatique)

1. Réservation créée → notification push à tous les thérapeutes du lieu (filtré par genre si demandé par le client)
2. Premier thérapeute qui accepte → assigné automatiquement
3. Si un thérapeute refuse → ajouté à `declined_by[]`
4. Si aucun thérapeute n'accepte dans le délai → alerte à l'équipe admin

### Mode manuel (fallback)

- L'admin/concierge peut assigner manuellement un thérapeute depuis l'agenda
- Drag & drop ou sélection directe

### Objectif confirmation < 10 min

Le système vise une confirmation (ou re-proposition) en moins de 10 minutes :
- Notifications push immédiates
- Timeout configurable
- Escalade automatique vers l'admin si pas de réponse

## Système de Commission

### Calcul des montants

```
Prix total (TTC) = Σ(prix soins)

Commission thérapeute = Prix total × (hairdresser_commission / 100)
Commission lieu       = Prix total × (hotel_commission / 100)
Commission Lymfea     = Prix total - Commission thérapeute - Commission lieu

TVA = Prix total × (vat / 100)
```

### Exemple

```
Prix total: 100€
therapist_commission: 70%
venue_commission: 10%
vat: 20%

→ Thérapeute reçoit: 70€
→ Lieu reçoit: 10€
→ Lymfea reçoit: 20€
→ TVA collectée: 20€
```

### Stripe Connect

1. Thérapeute s'inscrit → création compte Stripe Connect
2. Onboarding Stripe → `stripe_onboarding_completed = true`
3. À chaque booking `completed` → payout automatique via Stripe Transfer
4. Historique dans `hairdresser_payouts` (à renommer `therapist_payouts`)

## Gestion des Disponibilités

### venue_deployment_schedules

Trois types de planning :

1. **always_open** : Le lieu est toujours disponible
2. **specific_days** : Jours spécifiques de la semaine
   - `days_of_week[]` : [1,3,5] = Lundi, Mercredi, Vendredi
   - `recurring_start_date` / `recurring_end_date` : Période
   - `recurrence_interval` : Toutes les N semaines
3. **one_time** : Dates ponctuelles
   - `specific_dates[]` : ["2024-02-15", "2024-02-22"]

### venue_blocked_slots

Créneaux horaires bloqués par jour (pause déjeuner, nettoyage entre séances, etc.) :
- `start_time` / `end_time` — plage horaire bloquée
- `days_of_week[]` — jours concernés (NULL = tous les jours)
- `label` — description ("Pause déjeuner", "Nettoyage cabines")

### Vérification disponibilité

```sql
is_venue_available_on_date(hotel_id, check_date) → boolean
get_venue_available_dates(hotel_id, start_date, end_date) → date[]
```

### Délai minimum avant réservation

Configurable via `treatment_menus.lead_time` (en minutes). Empêche les réservations de dernière minute.

## Salles de Soin (ex-Trunks)

Les "trunks" (malles mobiles dans OOM) sont reconvertis en **salles de soin** pour Lymfea :
- Chaque lieu a N salles de soin configurables
- Les RDV sont assignés à une salle spécifique (`bookings.trunk_id`)
- La disponibilité des salles est vérifiable en temps réel
- Le thérapeute peut voir depuis son mobile si la salle est libre pour prolonger un soin

## Soins "Prix sur Demande"

Pour les soins avec `price_on_request = true` :

1. Client demande un devis via `treatment_requests`
2. Admin reçoit la demande et l'évalue
3. Admin définit `quoted_price` et `quoted_duration`
4. Email avec lien de devis envoyé au client
5. Client accepte → réservation créée (`converted_booking_id`)

## Proposition de Créneaux Alternatifs

Si le créneau demandé est indisponible :

1. Le concierge propose jusqu'à 3 créneaux alternatifs (`booking_proposed_slots`)
2. Le thérapeute valide un créneau
3. Le client reçoit un email avec les propositions
4. Expiration automatique après 2h

## Ajout de Prestations en Cours de Soin (Roadmap)

Le thérapeute peut depuis son mobile :
1. Vérifier la disponibilité de la salle en temps réel
2. Ajouter une prestation supplémentaire (ex: +30 min massage)
3. Le paiement est déclenché automatiquement (CB ou facturation chambre)
4. Le RDV est mis à jour dans l'agenda

## Notifications

### Push (OneSignal)

| Événement | Destinataire | Message |
|-----------|--------------|---------|
| Nouvelle réservation | Thérapeutes du lieu | "Nouvelle réservation disponible" |
| Booking accepté | Client | "Votre réservation est confirmée" |
| Booking annulé | Thérapeute/Client | "Réservation annulée" |
| Rappel veille | Thérapeute | Récap des RDV du lendemain |
| Rappel H-3 | Thérapeute | Détails client, soin, durée, salle |
| Rappel J-1 | Client | "Rappel de votre soin demain" |
| Demande de note | Client | "Notez votre expérience" |
| Timeout attribution | Admin | "Aucun thérapeute n'a accepté" |

### Emails

- Confirmation de réservation au client
- Rappel J-1 au client
- Email post-soin pour feedback
- Email d'indisponibilité + créneaux alternatifs
- Notifications internes aux équipes (conciergerie, spa, Lymfea) sur chaque événement

## Feedback Post-Soin (Roadmap)

1. X heures après le soin → email automatique avec lien de feedback
2. Formulaire simple : note (1-5) + commentaire
3. Résultats visibles côté admin

## Annulations & No-show (Roadmap)

- Politique d'annulation paramétrable par lieu (délai + montant pénalité)
- Annulation dans le délai → remboursement total
- Annulation hors délai → pénalité automatique
- No-show → marquage par le thérapeute, pénalité débitée sur CB ou facturée à l'hôtel

## Tokens de Sécurité

| Token | Usage |
|-------|-------|
| `quote_token` | Validation devis par le client |
| `rating_token` | Lien unique pour noter le thérapeute |
| `invite_token` | Invitation thérapeute/concierge/admin |

## Internationalisation

- Langues supportées : FR, EN
- Détection automatique via navigateur
- Stockage préférence utilisateur
- Fichiers : `src/i18n/locales/{fr,en}/` (namespaces: common, admin, client, pwa)
- Les emails doivent être envoyés dans la langue du client
