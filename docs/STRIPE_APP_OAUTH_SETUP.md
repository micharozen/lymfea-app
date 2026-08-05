# Stripe App « Saoma » — setup OAuth

> Doc **interne**. Pour le guide destiné aux établissements qui collent leur clé secrète
> (méthode historique, toujours supportée), voir [STRIPE_WEBHOOK_CLIENT_SETUP.md](./STRIPE_WEBHOOK_CLIENT_SETUP.md).

Depuis l'OAuth, un établissement connecte **son propre compte Stripe** en un clic depuis
`/admin/places/:id` → Méthode de paiement → **Connecter Stripe**. Plus aucune clé secrète
n'est échangée, et le webhook est créé automatiquement sur son compte.

## Les deux clés à ne pas confondre

| Clé | À qui elle appartient | À quoi elle sert |
|---|---|---|
| `access_token` (OAuth) | à **l'établissement** | appeler l'API Stripe sur son compte |
| `STRIPE_APP_SECRET_KEY` | à **nous** (compte propriétaire de l'app Saoma) | signer les échanges `code → tokens` et les refresh |

L'`access_token` vit 1 h, le `refresh_token` 1 an et **tourne à chaque échange**. Les deux
sont stockés chiffrés dans Supabase Vault ; seule l'expiration est en clair sur la ligne
(`hotel_payment_configs.oauth_expires_at`) pour éviter un déchiffrement à chaque appel.

## 1. Publier l'app (une fois)

Le manifeste [saoma/stripe-app.json](../saoma/stripe-app.json) est la **source de vérité**.
L'app est *app-only* (headless) : pas d'UI extension, donc pas de `stripe apps start`.

```bash
cd saoma
stripe apps upload            # test  (--live pour la prod)
stripe apps status            # suivre le traitement
```

Le manifeste déclare déjà `distribution_type: public`, `stripe_api_access_type: oauth`,
`sandbox_install_compatible: true` (cf. §2), les 3 redirect URIs et 17 permissions. Toute modification passe par le fichier puis un
nouvel `upload` — les slugs ont été validés contre `stripe apps grant list-permissions`.

> ⚠️ `stripe apps upload` demande d'accepter le [Stripe Apps Agreement](https://stripe.com/legal/apps).

Les permissions ne couvrent pas que nos appels serveur : la **clé publiable** rendue par
l'OAuth hérite elle aussi des permissions de l'app, donc la page Checkout hébergée par
Stripe tombe sur le même mur. C'est ainsi que `payment_method_write` s'est révélée
nécessaire — `POST /v1/payment_methods` appelé depuis `checkout.stripe.com`, pas depuis
nos edge functions. Un refus se lit dans les logs du compte du lieu :
`more_permissions_required_for_application` + le path exact.

Ajouter une permission oblige le lieu à **réautoriser** : les tokens émis restent figés
sur les permissions consenties.

`product_write` et `plan_write` ont été retirées en 0.0.5, la review Stripe App
Marketplace les jugeant non justifiées par la description de l'app. Aucun appel direct à
`stripe.products` / `stripe.prices` n'existe dans le code : elles ne pouvaient servir qu'aux
objets ad hoc créés par les `price_data` / `product_data` inline des Checkout Sessions. Si
le Checkout casse en sandbox (`more_permissions_required_for_application`), il faut les
remettre et justifier ce chemin auprès de Stripe.

## 2. Récupérer les identifiants OAuth

Dashboard Stripe → l'app **Saoma** :

- Onglet **External test** → lien OAuth + `client_id` de **test** (suffisant pour valider,
  pas besoin de publier sur le Marketplace).
- Onglet **Settings** → lien OAuth + `client_id` de **production**, une fois l'app publiée.

Test et production sont deux environnements OAuth **strictement séparés** : `client_id`
différents, et l'échange doit être signé avec la clé du même mode (`sk_test_` / `sk_live_`).

⚠️ Les deux liens n'ont pas la même forme, et Stripe refuse le mauvais avec
« The provided OAuth link is invalid » :

```
External test  https://marketplace.stripe.com/oauth/v2/chnlink_XXX/authorize?client_id=…
Publié         https://marketplace.stripe.com/oauth/v2/authorize?client_id=…
```

Le segment `chnlink_…` du lien External test se pose dans `STRIPE_APP_OAUTH_LINK_ID` ;
tant que l'app n'est pas publiée, la forme sans segment échoue **même avec le bon
`client_id`**.

### Où le compte testeur doit-il se trouver ?

Le lien External test installe une version **test-mode** de l'app. Le compte qui
l'installe doit donc être en mode test, avec un **administrateur** aux commandes
(max 25 testeurs par app). Deux refus possibles, opposés :

| Message | Ce qu'il veut dire |
|---|---|
| « Switch to a sandbox to install this app » | le compte est en **live** — passer en mode test |
| « This app can't currently be installed into a sandbox » | le compte est dans une **sandbox**, et le manifeste ne les autorisait pas |

Les sandboxes ont remplacé le mode test hérité, mais une app n'y est installable que si
elle déclare `sandbox_install_compatible: true` — d'où sa présence dans le manifeste.
Stripe le vérifie à la review, donc un compte qui n'a que des sandboxes ne pourra
peut-être pas installer la version external test avant publication ; le repli est un
compte disposant encore du **mode test hérité**.

### Trois environnements, trois clés d'échange

Une installation en sandbox ne se rattache pas à notre mode test : Stripe crée dans le
compte propriétaire un **environnement de test géré** (*managed sandbox*), nommé d'après
l'id de l'app (`saoma`), auquel se connectent toutes les installations sandbox. La clé qui
signe `code → tokens` doit appartenir au même environnement que le lien d'installation :

| Le lieu a installé depuis… | `STRIPE_APP_SECRET_KEY` doit être… |
|---|---|
| une **sandbox** | la clé de la **managed sandbox** de l'app (Dashboard → basculer sur l'environnement `saoma`) |
| le **mode test hérité** | la clé test du compte propriétaire |
| la **prod** (app publiée) | la clé live du compte propriétaire |

Se tromper donne `invalid_grant: Authorization code provided does not belong to you`,
message identique dans les trois cas. Test rapide d'une clé avant de la poser :

```bash
curl -s https://api.stripe.com/v1/account -u "sk_test_XXX:" | head -3   # → acct_ de l'environnement
```

Stripe recommande des **redirect URIs distinctes** par environnement pour choisir la clé
au moment de l'échange. On s'en passe : un déploiement donné ne sert qu'un environnement
(staging → sandbox, prod → live), donc la clé suit l'environnement de déploiement et non
la requête. À revoir le jour où un même déploiement devrait accueillir les deux.

## 3. Variables d'environnement

À poser sur Supabase Edge Functions (et Railway si le backend Hono sert les paiements) :

| Variable | Valeur | Note |
|---|---|---|
| `STRIPE_APP_CLIENT_ID` | `client_id` de l'app | test sur staging, live en prod |
| `STRIPE_APP_OAUTH_LINK_ID` | `chnlink_…` du lien External test | **obligatoire tant que l'app n'est pas publiée** — à retirer une fois en ligne sur le Marketplace |
| `STRIPE_APP_SECRET_KEY` | clé secrète de l'**environnement** du compte propriétaire qui a servi à l'installation (cf. §2) | **fallback** sur `STRIPE_SECRET_KEY` si absente — à poser explicitement dès que l'app n'appartient pas au même compte Stripe qu'Eïa, ou que les lieux installent depuis une sandbox |
| `STRIPE_APP_WEBHOOK_SECRET` | app signing secret de l'endpoint de l'app | cf. §4bis — unique pour tous les lieux |
| `SITE_URL` | prod : `https://saoma.io` · env de test : `https://demo.saoma.io` | **obligatoire** — déjà posée |

`SITE_URL` n'est pas optionnelle ici : la redirect URI en est dérivée et Stripe fait un
**exact match**. Le fallback historique `https://${brand.appDomain}` pointe sur
`app.lymfea.fr`, qui n'est pas déclaré — `stripe-oauth-start` échoue donc explicitement
si la variable manque, plutôt que de produire une URI rejetée.

Les redirect URIs déclarées :

```
https://saoma.io/admin/payment-oauth-callback/stripe           (prod)
https://app.eiaspa.fr/admin/payment-oauth-callback/stripe      (prod, domaine historique)
https://demo.saoma.io/admin/payment-oauth-callback/stripe      (env de test — SITE_URL actuelle)
```

Deux URIs ont sauté en 0.0.5. `app.saoma.io` ne résolvait sur aucun déploiement
(404 `DEPLOYMENT_NOT_FOUND`) : la prod est servie à la racine, `https://saoma.io`, et
l'URI déclarée ne correspondait donc à rien — l'installation live aurait échoué sur un
exact match. `apptest.eiaspa.fr` a été retirée à la demande de la review Marketplace
(« remove the external test URLs »). `demo.saoma.io` est conservée tant que Stripe teste
le parcours sur le compte de démo.

⚠️ `SITE_URL` de l'environnement de test vaut `https://demo.saoma.io`. Ne la change
pas pour faire coller une URI : **38 fichiers** la lisent pour construire les liens
clients (confirmations, liens de paiement, invitations, OTP…). C'est le manifeste
qu'on adapte, jamais `SITE_URL`.

Route générique avec le provider en segment de chemin : ajouter un provider n'oblige
jamais à renommer une URI existante, et la page de callback sait quelle edge function
appeler sans stocker le provider sur le `state`.

**Stripe refuse le HTTP** à l'upload (`expect valid HTTPS uri`) : pas de
`http://localhost` possible. Le flow OAuth ne peut donc pas être bouclé sur un
`bun dev` nu — on valide sur staging, ou via un tunnel HTTPS (ngrok/cloudflared)
dont l'URL devrait alors être ajoutée à cette liste puis réuploadée.

## 4. Le flow

```
Admin ──"Connecter Stripe"──> stripe-oauth-start   (crée un state one-shot, 10 min)
                                     │
                                     v
                        marketplace.stripe.com/oauth/v2/authorize
                                     │  consentement du lieu
                                     v
        /admin/payment-oauth-callback/stripe  (page admin, code + state)
                                     │
                                     v
                            stripe-oauth-callback
                              ├── claim_payment_oauth_state  (anti-rejeu + anti-CSRF)
                              ├── code → tokens
                              ├── crée le webhook sur le compte du lieu
                              └── Vault + hotel_payment_configs
```

C'est la **page admin** qui reçoit la redirection, pas Stripe qui appelle l'edge function :
l'appelant est donc un admin authentifié, et le `state` est en plus vérifié contre son
`user_id`.

## 4bis. Les webhooks (à configurer une seule fois)

Une Stripe App ne crée **pas** d'endpoint chez chaque lieu. Elle en déclare **un
seul**, côté Dashboard de l'app, qui reçoit les événements de **tous** les comptes
qui l'ont installée.

Dans le Dashboard Stripe → app Saoma → webhooks :

1. Ajouter un endpoint pointant sur
   `<SUPABASE_URL>/functions/v1/stripe-webhook` — **sans** `?hotel_id=`.
2. Cocher **« Listen to events on connected accounts »**.
3. Événements à activer :
   `checkout.session.completed`, `checkout.session.async_payment_failed`,
   `invoice.payment_succeeded`, `payment_intent.payment_failed`,
   et `account.application.deauthorized` (désinstallation).
4. Récupérer le **app signing secret** et le poser en `STRIPE_APP_WEBHOOK_SECRET`.

C'est donc un secret **unique pour tous les lieux**, contrairement au BYOK où
chaque lieu a son `whsec_` en Vault.

Le routage se fait alors par le **payload**, pas par l'URL : chaque événement porte
`account: acct_…`, que `stripe-webhook` résout en `hotel_id` via
`hotel_payment_configs.stripe_account_id` (colonne indexée pour ça). Un compte
inconnu renvoie `200` — sinon Stripe retenterait indéfiniment.

`stripe-webhook` teste donc les secrets dans l'ordre app → plateforme quand il n'y a
pas de `?hotel_id=`, ce qui laisse les trois chemins (BYOK, app, plateforme legacy)
cohabiter sur la même fonction.

Sur `account.application.deauthorized`, la config du lieu est purgée
automatiquement : les tokens sont morts, autant arrêter de les utiliser.

## 5. Points d'implémentation notables

**Aucun webhook créé par lieu.** Stripe refuse la permission `webhook_write` aux
apps (`requesting webhook_write permission is disallowed`) — et elles n'en ont pas
besoin : voir la section 5bis ci-dessous.

**Refresh concurrent.** Les refresh tokens tournent : si deux instances rafraîchissent en
même temps, la perdante reçoit `invalid_grant`, relit le Vault où la gagnante a déjà écrit,
et repart. Pas de verrou.

**Le cache du resolver a une durée de vie.** Une entrée OAuth n'est jamais mise en cache
plus longtemps que son token (`expiry − 5 min`).

**Pas de `deauthorize`.** Contrairement à Connect, on ne peut pas révoquer côté Stripe.
« Déconnecter » purge les tokens et le webhook de notre côté ; la révocation définitive se
fait par l'établissement en désinstallant l'app depuis son Dashboard.

**Transferts thérapeutes.** Les comptes Connect des thérapeutes appartiennent à la
plateforme Eïa, pas au lieu : `finalizePayment` saute donc le transfert quand le paiement
est encaissé avec une clé de lieu (OAuth ou BYOK). Comportement pré-existant, rendu
explicite.

## 6. Cohabitation avec le BYOK

`hotel_payment_configs.auth_method` arbitre :

- `keys` (défaut, legacy) → clé secrète collée par le lieu, lue dans le Vault ;
- `oauth` → access token de l'app Saoma.

Les deux passent par le même resolver. Coller une clé secrète dans « Configuration manuelle
(avancé) » rebascule le lieu en `keys` et efface les tokens OAuth ; à l'inverse, une
connexion OAuth réussie efface la clé secrète stockée — garder une clé pleine puissance
irait contre l'objectif, et laisserait le resolver retomber dessus silencieusement.

Aucune migration forcée : les lieux existants continuent de fonctionner tels quels.
