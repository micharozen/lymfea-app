# Monitoring & Logging — BetterStack

Deux pipelines complémentaires :

| Pipeline | Produit BetterStack | Transport | Couvre |
|---|---|---|---|
| **Logs métier** | Telemetry (Logs) | `fetch` HTTP direct | Events business (`payment.declined`, `rpc.reserve.no_slot`, …) + erreurs invokeEdgeFunction |
| **Erreurs JS** | Errors | SDK Sentry (`@sentry/react`) | Crashes JS (window.error, unhandledrejection, React ErrorBoundary), stack traces dé-minifiées via source maps, breadcrumbs |

## Configuration

### Secrets requis

Crée deux *sources* différentes dans BetterStack (platform **HTTP**) — une pour le frontend, une pour le backend. Chaque source a son **propre ingesting host** (visible dans la page de configuration de la source, ex: `s2439957.eu-fsn-3.betterstackdata.com`) et son propre **Source token**. Le token frontend est exposé publiquement (intégré au bundle JS), donc utilise un token ingest-only sans permission de lecture.

**Edge Functions (Supabase)**

```bash
supabase secrets set BETTERSTACK_SOURCE_TOKEN=<token_backend>
supabase secrets set BETTERSTACK_INGEST_URL=https://<host-backend>.betterstackdata.com
```

**Frontend (`.env.local`)**

```env
# Telemetry (logs métier)
VITE_BETTERSTACK_FRONTEND_TOKEN=<token_frontend>
VITE_BETTERSTACK_INGEST_URL=https://<host-frontend>.betterstackdata.com

# Errors (SDK Sentry → endpoint BetterStack)
VITE_SENTRY_DSN=<dsn_betterstack_errors>
# Optionnel — release pour grouper les erreurs par version
VITE_APP_VERSION=<git_sha_ou_tag>
```

Pour Telemetry, les deux variables (token + URL) sont obligatoires. Si l'une manque, le logger passe en mode console-only.

Au total **trois sources** à créer dans BetterStack :
- 1 source *Telemetry* (HTTP) pour le frontend (token public, ingest-only)
- 1 source *Telemetry* (HTTP) pour le backend
- 1 application *Errors* (fournit un DSN au format Sentry — l'ID projet à la fin du DSN est ignoré, n'importe quel chiffre marche)

### No-op sans token

Si aucun token n'est configuré, les helpers passent en mode console-only. Pratique pour le dev local et les preview deploys.

## Helpers

### Backend — `supabase/functions/_shared/logger.ts`

```ts
import { createLogger } from '../_shared/logger.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  const log = createLogger({ function: 'my-function', req });

  try {
    log.bind({ hotelId, bookingId }); // attached to every subsequent log
    log.info('event.name', { details });
    log.warn('booking.no_slot', { date, time });
    log.error('rpc.failed', err, { context });
    return new Response(...);
  } finally {
    await log.flush(); // critical — must await before returning
  }
});
```

- `createLogger({ function, req })` — accepte un `Request` pour reprendre l'header `x-request-id` ; sinon UUID auto.
- `log.bind(fields)` — attache des champs à tous les logs suivants (équivalent d'un *scope*).
- `log.flush()` — POST batch unique vers l'ingest BetterStack. **À appeler dans un `finally`** pour garantir l'envoi sur tous les chemins (return, throw).
- Mirror automatique vers `console.log/warn/error` pour rester visible dans le tail Supabase.

Wrapper alternatif :

```ts
serve(withLogging('my-function', async (req, log) => {
  log.info('handling');
  return new Response(...);
}));
```

`withLogging` ajoute `request.received` / `request.completed` automatiquement et gère le flush. Pas adapté aux handlers avec retours conditionnels multiples avant le `try`.

### Frontend — `src/lib/logger.ts`

```ts
import { logger } from '@/lib/logger';

logger.info('user.signed_in', { method: 'password' });
logger.warn('cart.empty_checkout');
logger.error('upload.failed', err, { fileSize });

// Contexte global (ajouté à chaque log)
logger.setContext({ userId, role });
logger.clearContext(['userId']);  // au sign-out
```

- Buffer en mémoire (max 20 entries), flush toutes les 5s, sur `pagehide` (via `fetch` avec `keepalive: true`).
- `initErrorTracking()` est appelé une fois dans `src/main.tsx` — démarre uniquement la boucle de flush. Les erreurs JS globales sont captées par le SDK Sentry (voir ci-dessous), pas par ce logger.

### Frontend — `src/lib/sentry.ts` (Errors)

```ts
import { Sentry } from '@/lib/sentry';

// Capture manuelle (rarement nécessaire — les erreurs non-catchées sont auto)
Sentry.captureException(error, { tags: { area: 'checkout' } });

// Breadcrumb pour tracer une action avant un crash
Sentry.addBreadcrumb({ category: 'cart', message: 'Item added', level: 'info' });
```

- `initSentry()` est appelé en premier dans `src/main.tsx` — installe les handlers globaux Sentry et le tracing browser.
- `setSentryUser({ id, role })` est appelé depuis `UserContext` à chaque changement de session.
- Désactivé en `VITE_ENV=development` pour éviter le bruit local.
- `tracesSampleRate` = 10% en prod, 100% en dev/staging.

#### Source maps

`vite.config.ts` active `build.sourcemap: true` — les fichiers `.map` sont émis dans `dist/assets/` et déployés avec le bundle. BetterStack les récupère via le lien `sourceMappingURL` à la fin de chaque JS.

⚠️ **Privacy** : les source maps sont publiquement accessibles avec le bundle. Le code source est donc lisible par quiconque ouvre les DevTools. Si c'est un problème, il faudra basculer vers l'upload via `@sentry/vite-plugin` (au prix d'un compte Sentry payant pour valider l'org token, sauf si BetterStack documente une API de réception compatible).

## Événements suivis

### Erreurs JS

**Côté Errors (Sentry)** — auto-capturé par le SDK :
- Toute exception non interceptée (`window.onerror`)
- Toute promise rejetée non interceptée (`unhandledrejection`)
- React `ErrorBoundary.componentDidCatch` (tag `error_boundary=true`, contexte `react.componentStack`)

**Côté Logs (Telemetry)** :

| Event | Source | Niveau |
|---|---|---|
| `edge_function.failed` | `invokeEdgeFunction` retourne une erreur | error |
| `edge_function.threw` | `invokeEdgeFunction` throw | error |

### Use cases métier

| Event | Source (fonction) | Niveau | Contexte |
|---|---|---|---|
| `booking.creation_failed` | create-client-booking | error | hotelId, paymentMethod |
| `booking.blocked_slot` | create-client-booking | warn | date, time |
| `booking.lead_time_violation` | create-client-booking | warn | minutesUntilBooking, maxLeadTime |
| `rpc.reserve.no_slot` | create-client-booking, create-draft-booking | warn | date, time, path |
| `rpc.reserve.failed` | create-client-booking, create-draft-booking | error | date, time |
| `draft.creation_failed` | create-draft-booking | error | rollback_count |
| `slot.already_validated` | validate-booking-slot | warn | bookingId, slotNumber |
| `slot.validation_failed` | validate-booking-slot | error | bookingId |
| `payment.declined` | stripe-webhook | warn | bookingId, error_code, decline_code, card_brand |
| `payment.finalize_failed` | finalize-payment | error | booking_id, payment_method |
| `payment.transfer_failed` | finalize-payment | error | therapist_id, amount |
| `payment.action_failed` | stripe-payment | error | action, stripe_error_code |
| `webhook.missing_signature` | stripe-webhook | warn | — |
| `webhook.missing_secret` | stripe-webhook | error | hotelId |
| `webhook.handler_failed` | stripe-webhook | error | event_type |

## Convention de nommage

- `<domain>.<event>` en snake_case (ex: `payment.declined`, pas `paymentDeclined`).
- `level=warn` pour les rejets attendus (slot pris, lead-time). `level=error` pour les vrais incidents (RPC inattendu, throw).
- Contexte structuré : `bookingId`, `hotelId`, `userId`, `therapistId`, etc. — *pas* d'IDs dans le `message`.

## Étendre l'instrumentation

Pour ajouter une nouvelle Edge Function :

1. Importer `createLogger` depuis `_shared/logger.ts`.
2. Créer `const log = createLogger({ function: '<name>', req });` après le check OPTIONS.
3. Wrapper le handler dans `try { ... } finally { await log.flush(); }`.
4. `log.bind({ ... })` dès que les IDs utiles sont connus.
5. Logger les business events à `warn`/`error` selon la criticité.

Pour le frontend, importer `logger` depuis `@/lib/logger` et appeler `logger.error('event.name', err, ctx)`.

## Limites connues

- Les logs perdus en cas d'échec d'ingest BetterStack ne sont pas re-tentés (fire-and-forget).
- Le frontend logger n'est pas SSR-safe (assume `window`/`navigator`).
- Pas d'uptime monitor ni de heartbeat configuré pour le moment — voir le plan dans le ticket d'origine pour la suite (Phase 1, 3, 4).
