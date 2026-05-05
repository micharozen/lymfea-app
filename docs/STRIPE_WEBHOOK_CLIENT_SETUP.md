# Configurer le paiement Stripe pour votre établissement

> Cette procédure connecte votre **propre compte Stripe** à Eïa. Une fois terminée, vos paiements clients arrivent directement sur votre compte et leur statut se met à jour automatiquement dans Eïa.

**Durée estimée :** 10 minutes
**Prérequis :**
- Un compte Stripe actif en mode **Live** ([dashboard.stripe.com](https://dashboard.stripe.com))
- Un accès **administrateur** à votre tableau de bord Eïa

---

## Vue d'ensemble

Vous allez :

1. Récupérer **3 informations** depuis votre compte Stripe (clé secrète, clé publique, identifiant de compte)
2. Créer un **webhook** dans Stripe avec une URL **unique à votre établissement** (générée par Eïa)
3. Récupérer la **clé de signature** du webhook
4. Renseigner ces 4 valeurs dans Eïa, puis tester la connexion

---

## Étape 1 — Ouvrir la configuration paiement dans Eïa

1. Connectez-vous à votre tableau de bord Eïa.
2. Allez dans **Lieux** → ouvrez votre établissement.
3. Onglet **Général** → section **Méthode de paiement** → cliquez sur **Configurer**.
4. Dans le champ **Fournisseur**, sélectionnez **Stripe**.

Vous voyez maintenant un formulaire avec plusieurs champs et, en bas, un champ **Webhook URL Stripe** déjà pré-rempli — gardez cette page ouverte, vous allez y revenir.

## Étape 2 — Récupérer vos clés API Stripe

Dans un nouvel onglet, ouvrez [dashboard.stripe.com](https://dashboard.stripe.com) et vérifiez en haut à gauche que vous êtes bien en mode **Live** (interrupteur "Mode test" désactivé).

### Clé secrète et clé publique

1. Menu **Développeurs** → **Clés API**.
2. Sous **Clés standard** :
   - Copiez la **Clé publiable** (commence par `pk_live_...`)
   - Cliquez sur **Révéler la clé secrète live** puis copiez-la (commence par `sk_live_...`)

### Identifiant de compte

1. Cliquez sur votre nom de compte en haut à droite → **Paramètres du compte**.
2. Dans **Détails du compte**, copiez l'**Identifiant de compte** (commence par `acct_...`).

> Conservez ces 3 valeurs de côté pour la fin.

## Étape 3 — Créer le webhook dans Stripe

Toujours dans Stripe :

1. **Développeurs** → **Webhooks** → **+ Ajouter un endpoint**.
2. **URL du endpoint** : retournez sur la page Eïa (étape 1), cliquez sur l'icône **Copier** à droite du champ **Webhook URL Stripe**, puis collez la valeur dans Stripe.

   L'URL ressemble à :
   ```
   https://xfkujlgettlxdgrnqluw.supabase.co/functions/v1/stripe-webhook?hotel_id=<UUID-de-votre-établissement>
   ```
   > ⚠️ Le paramètre `?hotel_id=...` est **essentiel** : c'est ce qui permet à Eïa d'identifier votre établissement. Ne modifiez pas l'URL, copiez-la telle quelle depuis Eïa.

3. **Description** (optionnel) : `Eïa — paiements`.
4. **Version de l'API** : laissez la version par défaut.
5. Cliquez sur **Sélectionner des évènements** et cochez exactement ces 4 évènements :
   - `checkout.session.completed`
   - `checkout.session.async_payment_failed`
   - `payment_intent.payment_failed`
   - `invoice.payment_succeeded`
6. Cliquez sur **Ajouter des évènements**, puis **Ajouter un endpoint**.

## Étape 4 — Récupérer la clé de signature du webhook

Stripe affiche maintenant la page de détail de votre nouveau webhook.

1. Dans la section **Secret de signature** (ou *Signing secret*), cliquez sur **Révéler**.
2. Copiez la valeur complète (commence par `whsec_...`).

## Étape 5 — Renseigner les 4 valeurs dans Eïa

Retournez dans le dialog **Méthode de paiement** d'Eïa et remplissez :

| Champ Eïa | Valeur à coller |
|---|---|
| **Clé secrète Stripe** | `sk_live_...` |
| **Clé publique Stripe** | `pk_live_...` |
| **Identifiant compte Stripe** | `acct_...` |
| **Webhook secret** | `whsec_...` |

Cliquez sur **Enregistrer**.

## Étape 6 — Tester la connexion

Dans le même dialog, cliquez sur **Tester la connexion**.

- ✅ **Connexion réussie** → la configuration est terminée, les prochains paiements basculeront automatiquement.
- ❌ **Échec** → vérifiez d'abord que vous êtes en mode **Live** côté Stripe et que la clé secrète a bien été copiée en entier.

---

## Vérifier qu'un paiement réel fonctionne

Après une première vraie réservation payée :

1. Dans Stripe → **Développeurs** → **Webhooks** → votre endpoint Eïa.
2. Onglet **Tentatives** : la dernière ligne doit être en **vert (`200 OK`)**.

Vous pouvez aussi déclencher un envoi de test depuis Stripe (bouton **Envoyer un évènement de test**, choisir `checkout.session.completed`) — Eïa doit répondre `200`.

---

## Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| Tentative `400 No signature` | Pas de clé `whsec_...` enregistrée côté Eïa | Recopiez le webhook secret dans le dialog **Méthode de paiement** |
| Tentative `400 Bad signature` | `whsec_...` ne correspond pas à cet endpoint | Régénérez la clé dans Stripe (bouton **Roll secret**) et recopiez-la dans Eïa |
| Tentative `400 Webhook secret not configured` | Le paramètre `?hotel_id=...` est manquant ou incorrect dans l'URL | Recopiez l'URL **complète** depuis Eïa (champ **Webhook URL Stripe**) |
| Aucune tentative ne s'affiche | Évènements non cochés | Sur l'endpoint Stripe, **Mettre à jour les évènements** et cocher les 4 |
| Paiement encaissé mais réservation reste **en attente** | Webhook non reçu | Vérifiez l'onglet **Tentatives** côté Stripe ; si tout est vert, contactez le support Eïa avec l'`event_id` |

## Sécurité

- Vos clés (`sk_live_...`, `whsec_...`) sont stockées **chiffrées** côté Eïa (Supabase Vault) et ne ressortent jamais en clair.
- Vous pouvez à tout moment **révoquer** une clé dans Stripe → **Développeurs** → **Clés API** ; elle deviendra invalide pour Eïa, et il suffira de remettre une nouvelle clé dans le dialog.

## Support

Une question ? Contactez **support@lymfea.com** en précisant :
- le nom de votre établissement,
- l'`event_id` Stripe concerné si applicable (visible dans l'onglet *Tentatives*).
