# Plan : Intégration Google Calendar pour les coiffeurs

## Context

Les coiffeurs OOM n'ont actuellement aucune synchronisation calendrier. L'objectif est de permettre aux coiffeurs de connecter leur Google Calendar pendant l'onboarding (ou depuis les settings) afin que :
1. OOM puisse **lire leur planning** (vérification des disponibilités lors du booking client + affichage admin)
2. OOM puisse **créer/modifier/supprimer des events** automatiquement lors du cycle de vie d'un booking (confirmed → update → cancelled)

L'intégration suit le même pattern que Stripe Connect : OAuth externe → callback → token stocké → opérations backend.

---

## 1. Setup Google Cloud Console (manuel, hors code)

- Créer un projet Google Cloud (ou utiliser l'existant)
- Activer l'API **Google Calendar API**
- Configurer l'écran de consentement OAuth (type "External")
- Créer des identifiants OAuth 2.0 (Web application) :
  - Redirect URI : `{SUPABASE_URL}/functions/v1/google-calendar-callback`
- Scopes requis :
  - `https://www.googleapis.com/auth/calendar.events` (CRUD events)
  - `https://www.googleapis.com/auth/calendar.readonly` (lire le planning)
- Stocker `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` dans les secrets Supabase

---

## 2. Database (migration SQL)

### Nouvelle table `hairdresser_google_tokens`
```sql
id (uuid PK)
hairdresser_id (uuid FK → hairdressers.id, UNIQUE)
google_access_token (text)
google_refresh_token (text)
google_token_expires_at (timestamptz)
google_calendar_id (text, default 'primary')
connected_at (timestamptz)
created_at / updated_at
```

Table séparée plutôt que colonnes sur `hairdressers` pour :
- Isoler les données sensibles (tokens)
- RLS plus restrictif (seul le service_role y accède, jamais le client)

### Nouvelle colonne sur `hairdressers`
```sql
google_calendar_connected (boolean, default false)
```

### Nouvelle colonne sur `bookings`
```sql
google_calendar_event_id (text, nullable)
```

### RLS policies
- `hairdresser_google_tokens` : aucun accès client-side (uniquement via service_role dans les edge functions)
- `google_calendar_connected` sur `hairdressers` : lecture par le hairdresser lui-même
- `google_calendar_event_id` sur `bookings` : lecture seule pour les hairdressers

---

## 3. Edge Functions

### 3a. `google-calendar-auth` — initier le OAuth
- Input : JWT du hairdresser authentifié
- Vérifie que c'est bien un hairdresser
- Génère l'URL de consentement Google avec :
  - `client_id`, `redirect_uri`, `scope`, `access_type=offline`, `prompt=consent`
  - `state` = JWT encodé ou hairdresser_id signé (pour retrouver l'utilisateur au callback)
- Retourne l'URL Google à ouvrir

### 3b. `google-calendar-callback` — traiter le retour OAuth
- Input : `code` + `state` (via query params, pas de JWT — c'est un redirect Google)
- Échange le `code` contre `access_token` + `refresh_token` via Google Token API
- Stocke les tokens dans `hairdresser_google_tokens`
- Met à jour `hairdressers.google_calendar_connected = true`
- Redirige vers `/pwa/google-calendar-callback?success=true`
- Config `supabase/config.toml` : `verify_jwt = false` (redirect HTTP GET depuis Google)

### 3c. `google-calendar-sync-event` — créer/modifier/supprimer un event
- Input : `{ bookingId, action: 'create' | 'update' | 'delete' }`
- Récupère le booking + hairdresser + tokens Google
- Refresh le `access_token` si expiré (via `refresh_token`)
- Selon l'action :
  - **create** : `POST /calendars/{calendarId}/events`
  - **update** : `PATCH /calendars/{calendarId}/events/{eventId}`
  - **delete** : `DELETE /calendars/{calendarId}/events/{eventId}`
- Stocke/met à jour `bookings.google_calendar_event_id`
- **Non-bloquant** : si Google API échoue, log l'erreur mais ne bloque pas le booking

### 3d. `google-calendar-get-events` — lire le planning
- Input : `{ hairdresserId, timeMin, timeMax }`
- Récupère les tokens, refresh si nécessaire
- `GET /calendars/{calendarId}/events?timeMin=...&timeMax=...`
- Retourne les events (busy slots)

### 3e. `google-calendar-disconnect` — révoquer l'accès
- Révoque le token via Google API
- Supprime la ligne dans `hairdresser_google_tokens`
- Met à jour `hairdressers.google_calendar_connected = false`

### Utilitaire partagé : `supabase/functions/_shared/googleCalendar.ts`
- Fonction `refreshAccessToken(refreshToken)` → nouveau access_token
- Fonction `buildCalendarEvent(booking, treatments, hotel)` → objet Google Calendar Event
- Constantes (scopes, URLs API Google)

---

## 4. Frontend

### 4a. Onboarding — nouvelle étape "calendar" (optionnelle, skippable)

Modifier `src/pages/pwa/Onboarding.tsx` :
- Ajouter `"calendar"` au type union des steps
- La step "notifications" mène à "calendar" au lieu de `handleFinish`
- Step "calendar" : icône Calendar, titre, bouton "Connecter Google Calendar" + bouton "Plus tard"
- Ajuster `getStepNumber()` pour step 4/4

### 4b. Page callback `src/pages/pwa/GoogleCalendarCallback.tsx`
- Même pattern que `StripeCallback.tsx`
- Lit `?success=true` ou `?error=...`
- Affiche chargement/succès/erreur
- Redirige vers onboarding ou profile selon le contexte

### 4c. Settings — connecter/déconnecter dans `src/pages/pwa/Profile.tsx`
- Section "Google Calendar"
- Si connecté : badge "Connecté" + bouton "Déconnecter"
- Si pas connecté : bouton "Connecter Google Calendar"

### 4d. Routing dans `src/App.tsx`
- Lazy import pour `GoogleCalendarCallback`
- Route `/pwa/google-calendar-callback`

### 4e. Admin — affichage du planning Google
- Dans `src/components/booking/BookingCalendarView.tsx`
- Quand un hairdresser sélectionné a `google_calendar_connected = true`, fetch ses events
- Afficher les blocs "occupé" en grisé

### 4f. Client booking — vérification des disponibilités
- Dans `src/pages/client/Schedule.tsx`
- Après sélection d'un hairdresser connecté, vérifier ses dispos via `google-calendar-get-events`
- Griser les créneaux qui chevauchent un event Google

---

## 5. Hooks dans le cycle de vie des bookings

Appeler `google-calendar-sync-event` (fire-and-forget, try/catch) :

| Événement | Fichier | Action |
|---|---|---|
| Admin crée booking confirmé | `src/hooks/booking/useCreateBookingMutation.ts` | `create` |
| Hairdresser accepte booking | `src/pages/pwa/Dashboard.tsx` (après `accept_booking` RPC) | `create` |
| Client booking auto-validé | `supabase/functions/create-client-booking/index.ts` | `create` |
| Booking annulé | `supabase/functions/handle-booking-cancellation/index.ts` | `delete` |
| Booking modifié (date/heure) | Points de modification existants | `update` |

---

## 6. i18n (FR + EN)

Fichiers : `src/i18n/locales/{fr,en}/pwa.json`

Clés à ajouter :
- `onboarding.calendar.step` / `.title` / `.subtitle` / `.connect` / `.skip` / `.success`
- `profile.googleCalendar.title` / `.connected` / `.disconnect` / `.connect`

---

## 7. Variables d'environnement Supabase

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI={SUPABASE_URL}/functions/v1/google-calendar-callback
```

---

## Ordre d'implémentation recommandé

1. Setup Google Cloud Console (manuel)
2. Migration SQL (table tokens + colonnes)
3. `_shared/googleCalendar.ts` (utilitaires partagés)
4. Edge Functions : `google-calendar-auth` → `google-calendar-callback` → `google-calendar-disconnect`
5. Frontend : callback page + route + onboarding step + profile settings
6. Edge Function : `google-calendar-sync-event`
7. Hooks dans le lifecycle des bookings (create/delete)
8. Edge Function : `google-calendar-get-events`
9. Frontend : admin calendar display + client availability check
10. i18n (au fur et à mesure)

---

## Vérification / Tests

1. **Onboarding** : créer un hairdresser test → onboarding → step calendar → connecter Google → vérifier token en DB
2. **Profile** : depuis settings, déconnecter → reconnecter
3. **Event creation** : créer un booking confirmé → vérifier que l'event apparaît dans Google Calendar du coiffeur
4. **Event deletion** : annuler le booking → vérifier que l'event est supprimé
5. **Availability** : ajouter un event manuellement dans Google Calendar → vérifier que le créneau est grisé côté client booking
6. **Admin** : sélectionner le coiffeur dans le calendrier admin → vérifier que les events Google s'affichent
7. **Token refresh** : attendre 1h+ → vérifier que le refresh automatique fonctionne
8. **Error handling** : désactiver les tokens → vérifier que les bookings fonctionnent toujours (non-bloquant)
