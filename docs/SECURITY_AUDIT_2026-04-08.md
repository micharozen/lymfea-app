# Audit de Securite Lymfea — Pre-Production

**Date :** 8 avril 2026
**Scope :** Application complete (Admin, PWA, Client Flow, Edge Functions, RLS, Stripe)
**Methode :** Revue de code statique

---

## Resume executif

L'application repose sur de **bonnes bases de securite** : RLS sur toutes les tables, validation Zod cote serveur, DOMPurify, UUIDs, prix recalcules depuis la DB, isolation des sessions guest. Cependant, **plusieurs vulnerabilites critiques et hautes doivent etre corrigees avant la mise en production**.

| Severite | Nombre | Status |
|----------|--------|--------|
| CRITIQUE | 6 | A corriger immediatement |
| HIGH | 8 | A corriger avant la prod |
| MEDIUM | 11 | A planifier rapidement |
| LOW | 5 | Ameliorations |

---

## CRITIQUE — Bloquant pour la prod

### C1. Edge Functions sans authentification

**Fichiers concernes :**
- `supabase/functions/generate-invoice/index.ts` (lignes 381-395)
- `supabase/functions/send-payment-link/index.ts` (lignes 29-80)
- `supabase/functions/pms-post-charge/index.ts` (lignes 10-25)

**Probleme :** Aucun check JWT. N'importe qui peut :
- Recuperer la facture de n'importe quelle reservation (`generate-invoice`)
- Envoyer des liens de paiement pour des reservations d'autres clients (`send-payment-link`)
- Poster des charges PMS non autorisees (`pms-post-charge`)

**Remediation :**
```typescript
const authHeader = req.headers.get('Authorization');
const token = authHeader?.replace('Bearer ', '');
const { data: { user }, error } = await supabase.auth.getUser(token);
if (error || !user) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
}
```

---

### C2. CORS `Access-Control-Allow-Origin: *` sur toutes les Edge Functions (~50+)

**Fichiers concernes :** Toutes les fonctions dans `supabase/functions/*/index.ts`

**Probleme :** N'importe quel site peut appeler les edge functions, y compris les endpoints authentifies. Permet des attaques CSRF.

**Remediation :**
```typescript
const ALLOWED_ORIGINS = Deno.env.get('ALLOWED_ORIGINS')?.split(',') || [];
const origin = req.headers.get('origin') || '';
const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
```

---

### C3. JWT decode sans verification de signature

**Fichiers concernes :**
- `supabase/functions/invite-therapist/index.ts` (lignes 55-76)
- `supabase/functions/delete-admin/index.ts` (lignes 30-48)

**Probleme :**
```typescript
const payload = JSON.parse(atob(parts[1])); // PAS de verification signature !
const userId = payload.sub;
```
Un attaquant peut forger un JWT avec n'importe quel userId et role.

**Remediation :** Utiliser `supabase.auth.getUser(token)` partout (comme fait correctement dans `invite-admin`).

---

### C4. Aucun rate limiting sur les functions email/SMS

**Fichiers concernes :**
- `send-payment-link`, `send-booking-confirmation`, `invite-admin`, `invite-therapist`, `send-booking-whatsapp`

**Probleme :** Aucun rate limit. Permet email bombing, epuisement des quotas Resend/WhatsApp, couts.

**Remediation :** Implementer rate limiting par IP/email (pattern deja present dans `send-otp`).

---

### C5. TherapistProtectedRoute — mismatch de role possible

**Fichier :** `src/components/TherapistProtectedRoute.tsx:33`

**Probleme :** Le code cherche `role = 'therapist'` mais l'enum DB `app_role` contenait originalement `'hairdresser'`. Si la migration `20260222000001` n'a pas ete appliquee, aucun therapeute ne peut se connecter.

**Remediation :** Verifier que la migration est appliquee. Ajouter un test de smoke sur le login therapeute.

---

### C6. Validation d'input insuffisante sur `generate-invoice`

**Fichier :** `supabase/functions/generate-invoice/index.ts:391-395`

**Probleme :** Aucune validation de type sur `bookingId`. Accepte n'importe quoi.

**Remediation :**
```typescript
if (!bookingId || typeof bookingId !== 'string' || !/^[0-9a-f-]+$/i.test(bookingId)) {
  throw new Error('Invalid booking ID format');
}
```

---

## HIGH — A corriger avant la prod

### H1. Stripe Connect Webhook sans signature si secret manquant

**Fichier :** `supabase/functions/stripe-connect-webhook/index.ts:36-51`

**Probleme :** Fallback sans verification de signature si `STRIPE_CONNECT_WEBHOOK_SECRET` n'est pas configure.

**Remediation :** Rendre la verification obligatoire. Echouer si le secret n'est pas configure.

---

### H2. Mot de passe en clair dans les emails d'invitation

**Fichier :** `supabase/functions/invite-admin/index.ts:290`

**Probleme :** `<p><strong>Mot de passe :</strong> ${generatedPassword}</p>`

**Remediation :** Envoyer un lien de reinitialisation de mot de passe via `supabase.auth.admin.generateLink({ type: 'recovery' })`.

---

### H3. Injection HTML dans les templates d'emails

**Fichiers :** `invite-admin/index.ts:289`, `invite-therapist/index.ts:152`

**Probleme :** `firstName`/`lastName` injectes dans le HTML sans echappement.

**Remediation :** Utiliser `escapeHtml()` (deja presente dans `contact-admin`).

---

### H4. Pas de verification d'autorisation sur `delete-admin`

**Fichier :** `supabase/functions/delete-admin/index.ts:80-90`

**Probleme :** L'admin A peut supprimer l'admin B d'un autre hotel. Pas de verification de scope hotel.

**Remediation :** Verifier que l'utilisateur a les droits sur l'hotel cible.

---

### H5. ManageBooking accessible sans verification d'ownership

**Fichier :** `src/pages/client/ManageBooking.tsx:33-52`

**Probleme :** Toute personne avec un UUID de booking peut voir/annuler la reservation.

**Remediation :** Ajouter une verification que le client est le proprietaire (via email ou token signe).

---

### H6. Pas de headers CSP (Content-Security-Policy)

**Probleme :** Aucun CSP detecte dans l'application. Augmente le risque XSS.

**Remediation :** Configurer CSP dans les headers HTTP du hosting.

---

### H7. Validation email insuffisante dans les Edge Functions

**Fichiers :** `invite-admin/index.ts:131`, `send-payment-link/index.ts:140-146`

**Probleme :** `if (!email?.includes("@"))` — insuffisant.

**Remediation :** Utiliser regex stricte ou Zod `.email()`.

---

### H8. Erreurs detaillees renvoyees au client

**Fichier :** `supabase/functions/generate-invoice/index.ts:457-469`

**Probleme :** `error.message` renvoye au client — peut exposer structure DB, noms de tables.

**Remediation :** Renvoyer un message generique. Logger l'erreur detaillee cote serveur.

---

## MEDIUM

| # | Probleme | Fichier/Zone |
|---|----------|-------------|
| M1 | XSS race condition — `innerHTML` avant DOMPurify | `InvoicePreviewDialog.tsx:32` |
| M2 | Pas de GDPR/droit a l'effacement — aucun mecanisme de suppression | Global |
| M3 | `booking_id` sequentiel expose dans emails/liens — enumeration possible | DB schema |
| M4 | PII dans les logs des edge functions | `send-payment-link`, `send-otp` |
| M5 | Pas d'idempotence sur generation de liens de paiement | `send-payment-link` |
| M6 | Pas de HTTPS enforcing sur URLs dans emails invitation | `invite-admin`, `invite-therapist` |
| M7 | Commission % non verrouillee au moment du booking | `stripe-webhook` |
| M8 | Storage buckets Supabase — verifier RLS sur avatars/tickets | Config Supabase |
| M9 | Validation upload cote serveur absente | `useFileUpload.ts` |
| M10 | Pas d'audit trail pour actions sensibles | Global |
| M11 | Customer bookings query sans filtre hotel pour concierges | `CustomerBookingsTab.tsx` |

---

## LOW

| # | Probleme |
|---|----------|
| L1 | `decodeHtmlEntities` utilise `innerHTML` — remplacer par lib dediee |
| L2 | Dev OTP code `123456` logue en console |
| L3 | PWA `devOptions: { enabled: true }` dans vite.config |
| L4 | `Math.random()` pour noms de fichiers upload |
| L5 | Debug `console.log` avec booking IDs dans Dashboard PWA |

---

## Points positifs (securite validee)

- [x] RLS active sur les **24 tables** critiques
- [x] Aucune escalade de privilege possible (therapist/concierge -> admin)
- [x] Concierges correctement filtres par `get_concierge_hotels()`
- [x] `accept_booking()` et `unassign_booking()` verifient `user_id = auth.uid()`
- [x] Acces anonyme bloque sur toutes les tables sensibles
- [x] SECURITY DEFINER correctement utilise pour les RPCs publiques
- [x] Validation Zod cote serveur (`create-client-booking`)
- [x] DOMPurify pour le rendu HTML (factures)
- [x] UUIDs pour les bookings (ID principal)
- [x] Prix Stripe recalcules depuis la DB (pas de confiance cote client)
- [x] `reserve_trunk_atomically` avec FOR UPDATE locks (anti double-booking)
- [x] Service_role key uniquement cote serveur
- [x] File upload : type check + taille max + nom aleatoire
- [x] Dependencies a jour (React 18, Supabase JS 2.101, Zod 3.25)
- [x] Signature dataURL sanitizee dans les factures (SVG bloque)
- [x] ClientFlowWrapper isole les sessions guest
- [x] Auto-refresh des tokens active
- [x] Mot de passe obligatoirement change pour les concierges (`must_change_password`)

---

## Plan d'action recommande

### Semaine 1 (Bloquant — CRITIQUE)
1. Ajouter auth JWT sur `generate-invoice`, `send-payment-link`, `pms-post-charge`
2. Remplacer CORS `*` par domaines specifiques sur toutes les edge functions
3. Fixer le decodage JWT (`invite-therapist`, `delete-admin`) -> utiliser `supabase.auth.getUser()`
4. Rendre la signature Stripe webhook obligatoire
5. Ajouter rate limiting sur les functions d'email/SMS
6. Verifier migration `20260222000001` appliquee en prod
7. Ajouter validation d'input sur `generate-invoice`

### Semaine 2 (HIGH)
1. Supprimer le mot de passe en clair des emails -> lien de reset
2. Echapper le HTML dans les templates email
3. Ajouter verification de scope dans `delete-admin`
4. Securiser ManageBooking (verifier ownership)
5. Ajouter CSP headers
6. Valider les emails avec regex/Zod cote edge functions
7. Messages d'erreur generiques cote client

### Semaine 3 (MEDIUM)
1. Implementer GDPR data deletion
2. Masquer `booking_id` sequentiel cote client
3. Verrouiller les commissions au moment du booking
4. Nettoyer les PII des logs
5. Ajouter audit trail
6. Verifier RLS sur les storage buckets

---

*Rapport genere le 8 avril 2026 — Revue de code statique sur l'integralite du codebase.*
