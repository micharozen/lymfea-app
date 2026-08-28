# Saoma — Stripe App

App **headless** (*app-only*, sans UI extension) dont le seul rôle est l'OAuth :
permettre à un établissement de connecter son propre compte Stripe à Eïa sans
nous transmettre de clé secrète.

`stripe-app.json` est la **source de vérité**. Toute modification (permissions,
redirect URIs, mode de distribution) se fait dans ce fichier, puis :

```bash
cd saoma
stripe apps upload --wait
```

Il faut ensuite **redéfinir la version de test externe** dans le Dashboard :
chaque upload crée une nouvelle version, et le canal reste sur la précédente.

## Pourquoi package.json et le lockfile sont là

Ils paraissent inutiles — l'app n'a ni code ni build, `extensions` vaut `null`,
et les dépendances déclarées (`@stripe/ui-extension-sdk`) ne servent à rien.

Mais `stripe apps upload` **refuse de packager sans lockfile** :

```
× Failed to package files
  failed to find any package manager lockfiles, run yarn/npm install
  with a version that produces lockfiles
```

Ne les supprime donc pas. Si l'upload se plaint de `node_modules`, relance un
`pnpm install` ici.

`stripe apps start` (serveur de dev des UI extensions) ne s'applique pas à une
app app-only : il cherche des vues à compiler et échoue.

Setup complet, variables d'environnement et configuration des webhooks :
[docs/STRIPE_APP_OAUTH_SETUP.md](../docs/STRIPE_APP_OAUTH_SETUP.md).
