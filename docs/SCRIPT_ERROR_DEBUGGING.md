# Script Error Debugging Guide

## Problème identifié

Le 21 juin 2026, nous avons détecté 13 erreurs JS "Script error." sur le flow de booking client, réparties sur 9 sessions distinctes :

- **2 sessions ont abouti** → checkout confirmé (`/confirmation/...`)
- **7 sessions bloquées** sur la landing (`/client/cabh-eiaspa`)
- **Double déclenchement** par session (×2 à ~0,3 s d'écart) → probable erreur de rendu React ou polyfill côté client

### Cause racine

Les erreurs "Script error." sont typiques d'exceptions JS **cross-origin sans header CORS**. Lorsqu'un script chargé depuis un domaine différent (ou un CDN) déclenche une erreur, le navigateur masque les détails de l'erreur (stack trace, fichier, ligne) pour des raisons de sécurité cross-origin.

**Sans l'attribut `crossorigin="anonymous"` sur les balises `<script>`**, nous ne pouvons pas voir :
- Le nom réel de l'erreur
- La stack trace
- Le fichier source
- La ligne et colonne

## Solutions implémentées

### 1. Activation de `crossorigin="anonymous"` sur les scripts Vite

**Fichier modifié**: `vite.config.ts`

Ajout d'un plugin Vite qui injecte automatiquement `crossorigin="anonymous"` sur tous les `<script>` générés :

```typescript
function crossoriginPlugin(): Plugin {
  return {
    name: 'crossorigin-inject',
    transformIndexHtml(html: string) {
      return html.replace(
        /<script\s+([^>]*?)(?<!crossorigin\s*=\s*"[^"]*")\s*>/gi,
        (match, attrs) => {
          if (/crossorigin\s*=/i.test(attrs)) {
            return match;
          }
          return `<script ${attrs.trim()} crossorigin="anonymous">`;
        }
      );
    }
  };
}
```

**Impact** : À partir du prochain build, toutes les erreurs JS auront une stack trace complète dans BetterStack.

### 2. Amélioration du logging d'erreurs

**Fichier modifié**: `src/lib/logger.ts`

Ajout de contexte supplémentaire pour les erreurs cross-origin :

```typescript
const errorContext: Record<string, unknown> = {
  filename: event.filename,
  lineno: event.lineno,
  colno: event.colno,
  message: event.message,
  isCrossOriginError: event.message === 'Script error.' && !event.filename,
  userAgent: navigator.userAgent,
  pathname: window.location.pathname,
};

if (errorContext.isCrossOriginError) {
  errorContext.note = 'Cross-origin error - check CORS and crossorigin attribute';
}
```

### 3. Logs de parcours utilisateur

**Fichiers modifiés** :
- `src/components/ClientFlowWrapper.tsx` → log lors de l'initialisation de la session client
- `src/pages/client/Welcome.tsx` → log lors du chargement de la page Welcome
- `src/pages/client/Confirmation.tsx` → logs détaillés du processus de confirmation

Ces logs permettent de **reconstituer le parcours utilisateur** et identifier où les erreurs se produisent.

## Comment monitorer les erreurs à l'avenir

### 1. Dans BetterStack Logs

Avec `crossorigin="anonymous"` activé, vous verrez désormais :

```json
{
  "level": "error",
  "message": "window.error",
  "error": {
    "name": "TypeError",
    "message": "Cannot read property 'map' of undefined",
    "stack": "TypeError: Cannot read property 'map' of undefined\n    at Welcome.tsx:123:45\n    at ..."
  },
  "context": {
    "filename": "https://cdn.example.com/assets/Welcome-abc123.js",
    "lineno": 123,
    "colno": 45,
    "pathname": "/client/cabh-eiaspa",
    "userAgent": "Mozilla/5.0 ..."
  }
}
```

### 2. Requête BetterStack pour suivre le flow client

```
level:error AND message:"window.error" AND context.pathname:"/client/*"
```

### 3. Requête pour identifier les erreurs de checkout

```
level:error AND (context.pathname:"/client/*/checkout" OR context.pathname:"/client/*/confirmation/*")
```

### 4. Parcours utilisateur complet

Filtrez par `session_id` pour voir tous les logs d'une session :

```
session_id:"abc-123-def" | sort by dt
```

## Analyse de l'incident du 21 juin

### Ce que nous savons

1. **13 erreurs "Script error."** sur 9 sessions distinctes
2. **2 bookings confirmés** → le flow a fonctionné malgré les erreurs
3. **7 sessions sur la landing** → impossible de savoir si elles ont continué sans stack trace
4. **Double déclenchement** (×2 à ~0,3 s) → suggère un problème de rendu React ou polyfill

### Ce que nous devons surveiller

Avec les correctifs en place, nous pourrons identifier :

1. **Quel composant React** cause l'erreur (stack trace complète)
2. **À quel moment du flow** l'erreur se produit (logs de parcours)
3. **Si l'erreur bloque** réellement le checkout ou si c'est juste du bruit
4. **Quels navigateurs/OS** sont affectés (userAgent dans les logs)

## Prochaines étapes

1. **Déployer** ce code en production
2. **Attendre** la prochaine occurrence d'erreur
3. **Analyser** la stack trace complète dans BetterStack
4. **Corriger** la cause racine identifiée

## Notes techniques

### Pourquoi les scripts sont cross-origin ?

- Vite génère des bundles JS avec des noms hashés (ex: `Welcome-abc123.js`)
- Ces bundles peuvent être servis par un CDN (Cloudflare, etc.)
- Sans `crossorigin="anonymous"`, le navigateur considère ces scripts comme cross-origin

### Alternatives envisagées

1. ❌ **Configurer CORS sur le CDN** → plus complexe, nécessite accès à la config CDN
2. ✅ **Ajouter `crossorigin="anonymous"`** → simple, fonctionne immédiatement
3. ❌ **Désactiver le CDN** → perte de performance

## Ressources

- [MDN: crossorigin attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/crossorigin)
- [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Script error debugging](https://blog.sentry.io/script-error-debugging/)
