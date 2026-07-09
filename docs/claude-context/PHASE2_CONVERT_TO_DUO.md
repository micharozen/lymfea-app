# Phase 2 — Convertir un booking solo en duo (dispatch par soin)

> Plan autonome, exécutable dans une conversation neuve. Suite de la Phase 1
> (lien stable soin↔thérapeute), déjà mergée : voir commits `4302ec55` +
> `40cb90f8` sur la branche `feat/booking-treatment-therapist-link`.

## Contexte & objectif

Depuis la page détail admin/concierge (`/admin/bookings/:id`), permettre de **convertir un booking non-duo en duo** en **assignant un thérapeute par soin**, **uniquement si le booking a ≥ 2 prestations** (`booking_treatments`). Sens unique (pas de réversion duo→solo).

Accessible **admin ET concierge**. Deux modes : **assign** (choisir un thérapeute par soin) ou **broadcast** (premiers à accepter).

## Ce que la Phase 1 a déjà livré (acquis, ne pas refaire)

- Colonne **`booking_treatments.therapist_id`** (nullable, FK `therapists`) = source de vérité « qui fait quel soin ». Migration `20260709120000`, policies UPDATE admin+concierge.
- `_shared/db/bookings.ts` expose le **row-id** (`BookingTreatment.bookingTreatmentId`) + `therapist_id` ; select inclut `id, therapist_id`.
- Helper partagé **`src/lib/therapistForTreatment.ts`** : `(index, treatmentCount, guestCount, allTherapistIds) → string | null` (combo-duo → therapist[i] ; solo → therapist unique ; shared-duo/broadcast → NULL).
- `DuoRecapTable` **lit le lien** avec fallback positionnel.
- Écriture du lien câblée dans `useCreateBookingMutation`, `EditBookingDialog`, `AddTreatmentDialog`.

## Modèle (rappels vérifiés)

- Duo = **1 ligne** `bookings`, `guest_count > 1`. `booking_therapists {booking_id, therapist_id, status:'accepted', assigned_at}` = **roster** + file d'acceptation broadcast (RPC `accept_booking`). `bookings.therapist_id` = thérapeute **principal** (leg 0) uniquement.
- Statut : `awaiting_hairdresser_selection` **supprimé** (migration `20260705120000`). Duo ouvert = `pending`, plein = `confirmed`. `accept_booking` bascule `pending→confirmed` quand `COUNT(booking_therapists accepted) >= guest_count`.
- Durée duo = **MAX** des durées ([src/features/admin-combo-duo/index.ts:75](../../src/features/admin-combo-duo/index.ts#L75)), pas la somme → la conversion réécrit `duration`.
- Soins parallèles → **thérapeutes tous distincts** (guard anti-doublon **requis**, pas cosmétique).
- Table thérapeutes = `therapists` (PK `id`).

## Setup branche

Depuis `staging` (une fois la Phase 1 mergée) :
```bash
git fetch origin && git checkout -b feat/convert-solo-to-duo origin/staging
```
(ou empiler sur `feat/booking-treatment-therapist-link` si la Phase 1 n'est pas encore mergée).

## Fichiers

**Nouveaux**
- `src/components/admin/booking/ConvertToDuoDialog.tsx`
- `src/hooks/booking/useConvertToDuoMutation.ts`

**Modifiés**
- `src/pages/admin/BookingDetail.tsx` — bouton + montage du dialog ; destructurer `therapists` de `useBookingData()`
- `src/hooks/booking/useAvailableTherapistsForSlot.ts` — param optionnel `excludeBookingId`
- `src/i18n/locales/{fr,en}/admin.json` — clés `booking.convertToDuo.*`

## 1. `useAvailableTherapistsForSlot` — `excludeBookingId?: string`

- Ajouter au type params + à la `queryKey`.
- Select `bookings` (~ligne 84) : ajouter `id`, ignorer `b.id === excludeBookingId` dans la boucle overlap.
- Select `booking_therapists` (~ligne 105) : ajouter `booking_id`, ignorer les lignes du booking exclu.
- **Critique** : sans ça, le thérapeute déjà assigné au booking se marque « occupé » par son propre booking et disparaît du picker.

## 2. Mutation — `useConvertToDuoMutation.ts`

```ts
interface ConvertToDuoParams {
  mode: "assign" | "broadcast";
  assignments?: { bookingTreatmentId: string; therapistId: string }[]; // assign : 1 par soin, distincts
  secondaryRoomId?: string | null; // optionnel, ≠ booking.room_id
}
```
Dérivés : `guestCount = booking.treatments.length` ; `newDuration = max(durées des soins)` (fallback `booking.duration`).

**Mode `assign`** :
1. `bookings.update` : `guest_count`, `duration: newDuration`, `status: "confirmed"`, `therapist_id` = thérapeute du 1er soin (principal), `therapist_name`, `assigned_at: now`, `secondary_room_id` (guard `!== room_id`, sinon `null`).
2. **`booking_treatments`** : `update {therapist_id}` **par `bookingTreatmentId`** pour chaque assignment (le lien stable — la colonne existe depuis la Phase 1).
3. **`booking_therapists`** : delete-all puis insert le **set distinct** des thérapeutes `{booking_id, therapist_id, status:'accepted', assigned_at}` (roster ; miroir `EditBookingDialog` ~ligne 774).
4. Notification : `invokeEdgeFunction("trigger-new-booking-notifications", { body: { bookingId } })`, try/catch + toast warning si échec.

**Mode `broadcast`** :
1. `bookings.update` : `guest_count`, `duration: newDuration`, `secondary_room_id`, **`status: "pending"`** (⚠️ jamais `awaiting_hairdresser_selection`) ; **ne pas toucher** `therapist_id`/`therapist_name`/`assigned_at`.
2. `booking_treatments.therapist_id` laissé **NULL** (`accept_booking` ne lie pas à un soin → affichage positionnel/« En attente »). Limite v1 assumée.
3. `booking_therapists` : conserver l'existant ; **backfill** si `booking.therapist_id` existe sans ligne (pour le compteur du RPC).
4. Notification : `invokeEdgeFunction("trigger-new-booking-notifications", { body: { bookingId, sendPaymentLink: false, notifyAll: true } })`.

**Jamais touché** : `total_price`, `surcharge_amount`, `payment_status`, `payment_method`, `booking_treatments` (hors `therapist_id`), `room_id`, `booking_date/time`, `booking_group_id`.

**onSuccess** : invalider `["bookings"]`, `["booking-therapists", booking.id]`, `["available-therapists-for-slot"]`, `["available-rooms"]` ; toast Sonner succès ; callback page → `setTherapistRefreshKey(k => k + 1)`. **onError** : `toast.error`.

## 3. Dialog — `ConvertToDuoDialog.tsx`

Props : `{ open, onOpenChange, booking, therapists, onSuccess }`. State `useState` (pas de RHF) :
- `mode: "assign" | "broadcast"` (défaut `"assign"`)
- `assignments: Record<bookingTreatmentId, therapistId>` (le 1er soin pré-rempli avec `booking.therapist_id` si présent)
- `secondaryRoomEnabled` + `secondaryRoomId` (rendu seulement si `booking.room_id`)

Data : `useAvailableTherapistsForSlot({ hotelId, date, time, durationMinutes: newDuration, treatmentIds, excludeBookingId: booking.id })` ; `useAvailableRooms(...)` (salle secondaire) ; `useConvertToDuoMutation`.

UI (shadcn `Dialog`, `max-w-lg`) :
- **Un picker par soin**, labellisé « {{nom}} · {{durée}} min » — c'est ici que se matérialise le dispatch. Utiliser `booking.treatments[i].bookingTreatmentId` comme clé d'assignment.
- **Guard anti-doublon obligatoire** : un thérapeute choisi pour un soin est exclu des autres pickers (logique `otherIds` de `BookingTherapistStep.tsx` ~ligne 389). Inclure l'id sélectionné même absent de la liste dispo (filet).
- Toggle assign/broadcast : version locale légère de `BroadcastCard` (`BookingTherapistStep.tsx` ~ligne 137) — ne pas importer le step complet. En broadcast : masquer les pickers + hint « les praticiens seront affectés à l'acceptation ».
- Bloc salle secondaire : checkbox + Select excluant `room_id` ; warning amber non-bloquant si capacité douteuse.
- Footer : Annuler + « Convertir et assigner » / « Convertir et diffuser » ; submit désactivé si mutation en cours, soin non affecté (assign) ou doublon.
- Récap : « conversion définitive » + helper durée (« Durée : max → 90 min »).

## 4. Bouton + gating — `BookingDetail.tsx`

```ts
const CONVERTIBLE_STATUSES = ["pending", "confirmed"]; // PAS awaiting_hairdresser_selection (supprimé)
const canConvertToDuo = !isDuo
  && (booking.treatments?.length ?? 0) > 1
  && CONVERTIBLE_STATUSES.includes(booking.status);
```
Destructurer `therapists` de `useBookingData()`. Bouton `variant="outline"` icône `Users` dans le header actions (entre « Paiement » et « Modifier »), **sans** guard `!isConcierge` (« Modifier » l'est déjà — cohérent). Monter le dialog près d'`EditBookingDialog` (~ligne 830), `onSuccess={() => setTherapistRefreshKey(k => k + 1)}`.
Après succès, le refetch fait apparaître le badge Duo + `DuoRecapTable` (rendus sous `isDuo`), qui lit désormais `booking_treatments.therapist_id` (Phase 1).

## 5. i18n — `booking.convertToDuo.*` (FR + EN, namespace admin)

`button` (« Convertir en duo »), `title`, `description` (« Les {{count}} soins se dérouleront en parallèle, chacun avec son praticien. Conversion définitive. »), `treatmentPickerLabel`, `durationHelper`, `modeAssignTitle`, `modeBroadcastTitle`, `modeBroadcastHelper`, `secondaryRoomLabel`, `roomCapacityWarning`, `noTherapistAvailable`, `submitAssign`, `submitBroadcast`, `cancel`, `successAssign`, `successBroadcast`, `error`, `notificationWarning`.

## Risques connus (v1)

- **Broadcast** : ne lie pas soin→thérapeute (`accept_booking` inchangé) → `therapist_id` par soin NULL, positionnel. Le dispatch stable ne vaut que pour le mode assign.
- **Édition post-conversion** : `EditBookingDialog` réapplique le lien de façon **positionnelle** (pas de vrais pickers per-soin) — le vrai dispatch éditable est un suivi hors v1.
- **Push thérapeute #2 en assign** : `trigger-new-booking-notifications` sans `notifyAll` ne notifie que le principal — parité v1 avec le flow d'édition duo.
- **Capacité salle** indicative (`useAvailableRooms` compte des bookings, pas des lits) ; warning non-bloquant.
- **RLS concierge** : vérifier UPDATE `booking_treatments` + `bookings` pour le rôle concierge en staging.

## Vérification

- `bunx tsc --noEmit` (0 erreur) ; `bun run build` (exit 0). NB : `vite build` ne type-check pas → lancer `tsc` séparément. `bun lint` a une baseline rouge préexistante (`no-explicit-any`) : vérifier seulement l'absence de **nouvelles** erreurs sur les fichiers touchés.
- Requêter la base locale en REST avec la **clé secret** (`supabase status`) — RLS cache `booking_treatments` en anon.
- Scénarios staging :
  1. Solo confirmé, 2 soins (60+90), thérapeute assigné → bouton visible ; assign : picker/soin, anti-doublon OK, #1 pré-rempli ; submit → `guest_count=2`, `duration=90`, **`booking_treatments.therapist_id` renseigné par soin**, 2 lignes `booking_therapists`, statut `confirmed`, `DuoRecapTable` bon thérapeute/bon soin (tester en **inversant** l'ordre des pickers → l'affichage suit le lien, pas l'index).
  2. Broadcast : statut `pending`, `therapist_id` NULL, push `notifyAll` ; acceptation PWA d'un 2e thérapeute → `accept_booking` passe `confirmed`.
  3. Bouton masqué : solo 1 soin / déjà duo / cancelled / completed.
  4. Compte concierge : conversion OK (RLS).
