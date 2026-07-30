# Saoma — Stripe App

App **headless** (*app-only*, sans UI extension) dont le seul rôle est l'OAuth :
permettre à un établissement de connecter son propre compte Stripe à Eïa sans
nous transmettre de clé secrète.

`stripe-app.json` est la **source de vérité** : toute modification (permissions,
redirect URIs, mode de distribution) se fait dans ce fichier, puis :

```bash
cd saoma
stripe apps upload --wait
```

Il faut ensuite **redéfinir la version de test externe** dans le Dashboard :
chaque upload crée une nouvelle version, et le canal reste sur la précédente.

Pas de `package.json` ni de build : une app *app-only* n'embarque que son
manifeste et son icône. Il n'y a rien à installer, et `stripe apps start`
(serveur de dev des UI extensions) ne s'applique pas.

Setup complet, variables d'environnement et configuration des webhooks :
[docs/STRIPE_APP_OAUTH_SETUP.md](../docs/STRIPE_APP_OAUTH_SETUP.md).
