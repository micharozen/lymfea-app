# Migration Backend — Supabase Edge Functions → Hono/Bun

## Pourquoi

Supabase Edge Functions posent 3 problèmes à l'échelle :
- **Cold starts** (200-500ms) sur les flows critiques (paiement, booking)
- **Coût par invocation** qui augmente avec le trafic
- **Logique métier dispersée** entre frontend, Edge Functions, RPC et RLS

## La solution : approche hybride

On garde Supabase (DB, Auth, Realtime, Storage) et on migre progressivement les Edge Functions vers un backend Hono/Bun sur Railway.

```
┌─────────────────────────┐
│  Frontend (React/Vite)  │
│  Railway Service        │
│                         │
│  invokeEdgeFunction()   │──── Routeur intelligent ────┐
│                         │                              │
│  supabase.from()        │──── Direct ──┐               │
│  supabase.auth.*        │──── Direct ──┤               │
└─────────────────────────┘              │               │
                                         ▼               ▼
                              ┌──────────────┐  ┌──────────────┐
                              │  Supabase    │  │ Hono Backend │
                              │              │  │ Railway      │
                              │ • Postgres   │◄─│              │
                              │ • Auth       │  │ Même DB      │
                              │ • Realtime   │  │ Même Auth    │
                              │ • Storage    │  │ Même JWT     │
                              │ • Edge Fns*  │  └──────────────┘
                              └──────────────┘
                              * progressivement vidé
```

## Le routeur intelligent

Le fichier `src/lib/supabaseEdgeFunctions.ts` contient une table :

```typescript
const migratedFunctions: Record<string, string> = {
  // Décommenter pour activer :
  // "check-availability": "/availability/check",
  // "finalize-payment": "/payments/finalize",
  // ...
};
```

Quand du code appelle `invokeEdgeFunction('check-availability', ...)` :
- **Ligne commentée** → appel Supabase Edge Function (comme avant)
- **Ligne décommentée** → appel Hono backend (nouvelle route)

**Zéro changement** dans les 25+ fichiers qui appellent `invokeEdgeFunction`. On décommente une ligne, c'est activé. On re-commente, c'est rollback.

## Migration automatique (chaque nuit)

Une GitHub Action tourne à **2h du matin** :

1. **Détecte le drift** : compare un hash SHA-256 du source Deno de chaque fonction déjà migrée avec le hash stocké au moment du port. Si le source a changé → statut `outdated`
2. **Re-migre les fonctions outdated** en priorité (elles passent avant les pending)
3. **Migre 3 nouvelles fonctions** (par priorité + dépendances)
4. Envoie le code Deno à **Claude Sonnet** pour conversion en Hono/Bun
5. Crée une **PR** avec le code porté

### Le cycle complet

```
Nuit 1-22 : Migration initiale (3 fonctions/nuit)
     │
     ▼
Nuit 23+ : Toutes les fonctions sont migrées
     │
     ▼
Le script continue de tourner chaque nuit
     │
     ▼
Tu modifies finalize-payment côté Edge Function
     │
     ▼
Nuit suivante : hash différent → statut "outdated"
     │
     ▼
Re-migration automatique → PR avec la nouvelle version
```

### Ce qui est automatique
- La conversion Deno → Hono
- La détection de drift (Edge Function modifiée après migration)
- La re-migration des fonctions modifiées
- La gestion des dépendances entre modules
- La création de PR

### Ce qui reste manuel
- **Review** du code généré (~15 min/matin)
- **Test** local (`cd backend && bun dev`)
- **Activation** (décommenter 1 ligne dans `migratedFunctions`)

## Structure du backend

```
backend/
├── src/
│   ├── index.ts              # Point d'entrée Hono + montage routes
│   ├── lib/
│   │   ├── supabase.ts       # Client admin (même DB que Supabase)
│   │   ├── stripe.ts         # Client Stripe
│   │   └── email.ts          # Envoi via Resend
│   ├── middleware/
│   │   ├── auth.ts           # Valide les JWT Supabase existants
│   │   └── error-handler.ts
│   ├── routes/               # 1 fichier = 1 groupe de fonctions
│   │   ├── availability.ts   # check-availability, validate-booking-slot
│   │   ├── payments.ts       # finalize-payment, charge-saved-card, ...
│   │   ├── webhooks.ts       # stripe-webhook, stripe-connect-webhook
│   │   └── ...
│   └── jobs/
│       └── expired-slots.ts  # Remplace pg_cron
├── scripts/
│   └── migrate-functions.ts  # Script de migration automatique
├── migration-state.json      # État de la migration (70 fonctions)
├── Dockerfile                # Image Bun pour Railway
└── railway.toml              # Config déploiement
```

## Commandes

```bash
cd backend

# Développement
bun install                  # Installer les dépendances
bun dev                      # Serveur local (port 3000, hot reload)

# Drift / Sync
bun run migrate:sync         # Vérifie si des Edge Functions ont changé
bun run migrate:sync:dry     # Idem, sans modifier le state

# Migration
bun run migrate:status       # Voir l'état (X migrated, Y pending)
bun run migrate:dry          # Simuler un run (sans rien écrire)
bun run migrate:one          # Migrer 1 seule fonction
bun run migrate              # Migrer 3 fonctions (défaut)
```

## Déployer sur Railway

1. Nouveau Service → GitHub Repo → Root Directory : `backend/`
2. Variables d'environnement (copier depuis `.env.example`) :
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
   - `RESEND_API_KEY`
3. Côté frontend, ajouter : `VITE_API_URL=https://eia-backend.railway.app`

## Ordre de migration

| Phase | Groupe | Fonctions | Priorité |
|-------|--------|-----------|----------|
| 1 | Paiements | stripe-webhook, finalize-payment, checkout, charge-card... | Critique |
| 2 | Booking | check-availability, validate-slot, create-booking, cancel... | Haute |
| 3 | Notifications | send-confirmation, notify-admin, push, email, WhatsApp... | Moyenne |
| 4 | Admin/Auth | invite-admin, send-otp, verify-otp, Stripe Connect... | Normale |
| 5 | Facturation | generate-invoice, monthly-invoices, venue-invoices... | Normale |
| 6 | PMS/Divers | opera-cloud, pms-*, support tickets, portal... | Basse |

## Coût

- **Migration** : ~$2.60 total (Claude Sonnet API)
- **Durée** : ~22 nuits à 3 fonctions/nuit
- **Backend Railway** : ~$5/mois (Starter plan)

## FAQ

**Si le backend tombe ?**
Re-commenter la ligne dans `migratedFunctions` → l'appel revient sur Supabase.

**Est-ce que le frontend change ?**
Non. `invokeEdgeFunction()` a la même signature qu'avant. Le routeur décide tout seul.

**Est-ce que l'auth change ?**
Non. Le backend valide les mêmes JWT Supabase. Même token, même utilisateur.

**Quand supprimer une Edge Function ?**
Quand la version Hono est activée et testée en production depuis au moins 1 semaine.
