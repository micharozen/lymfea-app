# QA Checklist — Branche feat/pwa-booking-reference-number

## Comment lancer les tests unitaires
```bash
bun test src/__tests__/pwa-features.test.ts
# Résultat attendu : 34 pass, 0 fail
```

---

## Tests manuels (nécessitent staging/navigateur)

### 1. Numéro de réservation sur la page booking PWA
**Où :** `/pwa/booking/:id`
- [ ] Le numéro de réf. `#XXXX` s'affiche en haut à droite sous la date et l'heure
- [ ] Le numéro correspond bien au `booking_id` (pas l'UUID)

---

### 2. Paiement chambre conditionné au client hôtel
**Où :** PWA → Finaliser une prestation → drawer de paiement

| Cas | Attendu |
|---|---|
| Venue = `hotel` + client a un n° de chambre | ✅ Bouton "Ajouter à la chambre" visible |
| Venue = `hotel` + client SANS n° de chambre | ❌ Bouton "Ajouter à la chambre" absent |
| Venue = `spa` | ❌ Bouton "Ajouter à la chambre" absent |

---

### 3. Carte pré-enregistrée
**Où :** `/pwa/booking/:id` — booking avec `payment_status = card_saved`
- [ ] Encart violet "Carte pré-enregistrée" visible dans le corps de la page
- [ ] Si `card_brand` et `card_last4` existent en DB → affiche ex. `"Visa •••• 4242 — sera débitée à la finalisation"`
- [ ] Si pas d'infos carte → affiche `"Sera débitée à la finalisation de la prestation"`
- [ ] Badge "Carte enregistrée" (violet) visible dans les badges de statut

---

### 4. Badge "Paiement dû"
**Où :** PWA Dashboard — onglet Mes réservations
- [ ] Un booking avec `payment_status = pending` affiche **"Paiement dû"** (plus "En attente")
- [ ] Vérifier aussi en anglais (si l'interface est en EN) : **"Payment due"**

---

### 5. Finalisation sans décharge / signature
**Où :** `/pwa/booking/:id` — booking confirmed ou ongoing

- [ ] Le bouton "Finaliser la prestation" est visible même si aucune décharge n'a été signée
- [ ] Le bouton **n'apparaît pas** si le booking est déjà `completed`, `paid`, `charged_to_room`
- [ ] Le bouton **n'apparaît pas** si le booking est `pending` (pas encore accepté)

#### Flow paiement chambre (2 étapes)
1. Cliquer "Finaliser la prestation"
2. [ ] Drawer s'ouvre avec les options de paiement
3. Cliquer "Ajouter à la chambre" (si visible)
4. [ ] Spinner de traitement s'affiche dans le drawer (pas de redirection vers signature)
5. [ ] Écran de succès s'affiche dans le drawer après confirmation API
6. [ ] Booking passe à `charged_to_room` dans la DB

#### Flow paiement carte sauvegardée
1. Booking avec `payment_status = card_saved`
2. [ ] Bouton violet "Finaliser la prestation (XX€)" visible en bas
3. Cliquer
4. [ ] Carte débitée directement, redirection dashboard
5. [ ] Pas de dialog de signature demandé

---

### 6. Titre modal "Nouvelle demande"
**Où :** Admin → Bookings ou vue liste → bouton créer

| Rôle connecté | Titre attendu |
|---|---|
| Admin | "Nouvelle réservation" |
| Concierge | "Nouvelle demande" |

---

### 7. Icônes notifications (staging)
**Où :** PWA → onglet Notifications
- [ ] Notification `new_booking` → icône cloche bleue (primary)
- [ ] Notification `booking_cancelled` → icône ❌ rouge
- [ ] Notification `booking_confirmed` → icône ✅ verte (était absent)
- [ ] Notification `payment_failed` → icône ⚠️ rouge (était absent)
- [ ] Notification type inconnu → icône mail grise

---

### 8. Système de push par genre (nécessite test en staging avec 2 thérapeutes)
**Scénario :** Client réserve avec préférence "femme", hotel avec 1 thérapeute femme + 1 homme

**Phase 1**
- [ ] Seule la thérapeute femme reçoit la push notification
- [ ] Le thérapeute homme ne reçoit rien
- [ ] Vérifier `bookings.therapist_gender_preference = 'female'` en DB

**Phase 2 (fallback)**
- [ ] La thérapeute femme refuse le booking
- [ ] Le thérapeute homme reçoit la push notification
- [ ] Le thérapeute avec `gender = null` reçoit aussi la push

**Sans préférence**
- [ ] Client réserve sans sélectionner de genre → tous les thérapeutes reçoivent la push

---

### 9. Régression — vérifier que rien n'est cassé
- [ ] Flow complet client : réservation → confirmation → dashboard
- [ ] Accepter un booking depuis la PWA fonctionne toujours
- [ ] Refuser un booking fonctionne toujours
- [ ] Agenda admin (couleurs des hôtels) s'affichent correctement
- [ ] Création de booking depuis l'admin fonctionne (wizard 3 étapes)
- [ ] Création de booking depuis la PWA (new-booking) fonctionne
