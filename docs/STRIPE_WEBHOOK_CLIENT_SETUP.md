# Configurer le paiement Stripe pour votre établissement

> Connecte votre **propre compte Stripe** à Eïa, pour que vos paiements clients soient encaissés sur votre compte et que leurs statuts se mettent à jour automatiquement dans Eïa.

**Durée estimée :** 10 minutes
**Prérequis :**
- Un compte Stripe actif en mode **Live** ([dashboard.stripe.com](https://dashboard.stripe.com))
- Un accès **administrateur** à votre tableau de bord Eïa

---

## Comment ça fonctionne

Eïa expose **un seul endpoint webhook** pour tous ses clients :

```
https://xfkujlgettlxdgrnqluw.supabase.co/functions/v1/stripe-webhook
```

Pour distinguer les notifications de chaque établissement, Eïa génère pour vous une **URL personnalisée** qui ajoute votre identifiant unique en paramètre :

```
https://xfkujlgettlxdgrnqluw.supabase.co/functions/v1/stripe-webhook?hotel_id=<votre-identifiant>
```

C'est cette URL **personnalisée** que vous collerez dans Stripe — elle permet à Eïa de retrouver automatiquement votre compte et de valider la signature du webhook avec votre propre clé.

> ⚠️ Ne modifiez jamais l'URL à la main. Eïa la génère et l'affiche dans votre tableau de bord (étape 1 ci-dessous), avec un bouton de copie. Une URL sans `?hotel_id=...` ou avec un mauvais identifiant entraînera des erreurs `400` côté Stripe.

---

## Étape 1 — Récupérer votre URL webhook personnalisée dans Eïa

1. Connectez-vous à votre tableau de bord Eïa.
2. Allez dans **Lieux** → ouvrez votre établissement.
3. Onglet **Général** → section **Méthode de paiement** → bouton **Configurer**.
4. Champ **Fournisseur de paiement** → sélectionnez **Stripe**.
5. Tout en bas du formulaire Stripe, repérez le champ **Webhook URL Stripe** : cliquez sur l'icône **Copier** à droite.

> Gardez cette page Eïa ouverte, vous y reviendrez à l'étape 4.

## Étape 2 — Créer le webhook dans Stripe

Dans un nouvel onglet, ouvrez [dashboard.stripe.com](https://dashboard.stripe.com) en mode **Live** (interrupteur "Mode test" désactivé en haut à gauche).

1. Menu **Développeurs** → **Webhooks** → bouton **+ Ajouter un endpoint**.
2. **URL du endpoint** : collez l'URL copiée à l'étape 1.
3. **Description** (optionnel) : `Eïa — paiements`.
4. **Version de l'API** : laissez la version par défaut.
5. Cliquez sur **Sélectionner des évènements** et cochez exactement les 4 évènements suivants :
   - `checkout.session.completed`
   - `checkout.session.async_payment_failed`
   - `payment_intent.payment_failed`
   - `invoice.payment_succeeded`
6. Cliquez sur **Ajouter des évènements**, puis **Ajouter un endpoint**.

## Étape 3 — Récupérer vos 3 clés Stripe

Toujours dans Stripe, récupérez les valeurs suivantes :

| Valeur | Où la trouver | Format |
|---|---|---|
| **Clé secrète** | Sur la page du webhook que vous venez de créer → section **Secret de signature** → **Révéler** | `whsec_...` |
| **Clé secrète API** | **Développeurs** → **Clés API** → **Révéler la clé secrète live** | `sk_live_...` |
| **Clé publique API** | **Développeurs** → **Clés API** → ligne *Clé publiable* | `pk_live_...` |

> 💡 **Compte Stripe Connect uniquement** : si vous utilisez un sous-compte Connect, récupérez aussi votre **Identifiant de compte** (`acct_...`) dans **Paramètres → Détails du compte**. Sinon, ce champ est facultatif.

## Étape 4 — Renseigner les valeurs dans Eïa

Retournez dans le dialog **Méthode de paiement** d'Eïa et remplissez :

| Champ Eïa | Valeur |
|---|---|
| **Clé secrète** | `sk_live_...` |
| **Clé publique** | `pk_live_...` |
| **Webhook secret** | `whsec_...` |
| **Compte Connect (optionnel)** | `acct_...` (uniquement si Stripe Connect) |

Cliquez sur **Sauvegarder**.

## Étape 5 — Tester la connexion

Toujours dans le dialog, cliquez sur **Tester la connexion**.

- ✅ **Connexion réussie** → la configuration est terminée. Les prochains paiements basculeront automatiquement.
- ❌ **Connexion échouée** → vérifiez que vous êtes bien en mode **Live** côté Stripe et que la clé secrète a été copiée en entier.

---

## Vérifier qu'un vrai paiement passe

Après une première vraie réservation payée :

1. Stripe → **Développeurs** → **Webhooks** → ouvrez votre endpoint Eïa.
2. Onglet **Tentatives** : la dernière ligne doit être en **vert (`200 OK`)**.

Vous pouvez aussi déclencher un envoi de test depuis Stripe (bouton **Envoyer un évènement de test**, choisir `checkout.session.completed`) — Eïa doit répondre `200`.

---

## Dépannage

| Réponse Stripe | Cause | Action |
|---|---|---|
| `400 No signature` | Webhook secret pas enregistré côté Eïa | Recopier le `whsec_...` dans le dialog **Méthode de paiement** |
| `400 Bad signature` | `whsec_...` ne correspond pas à cet endpoint | Régénérer la clé dans Stripe (**Roll secret**) et la recopier dans Eïa |
| `400 Webhook secret not configured` | URL Stripe sans `?hotel_id=...` ou avec un mauvais ID | Recopier l'URL **complète** depuis le champ **Webhook URL Stripe** d'Eïa |
| Aucune tentative ne s'affiche | Évènements non cochés sur l'endpoint | **Mettre à jour les évènements** dans Stripe et cocher les 4 |
| Paiement encaissé mais réservation reste **en attente** | Webhook non reçu côté Eïa | Vérifier l'onglet **Tentatives** Stripe ; si tout est vert, contacter le support Eïa avec l'`event_id` |

## Sécurité

- Vos clés (`sk_live_...`, `whsec_...`) sont stockées **chiffrées** côté Eïa (Supabase Vault) et ne ressortent jamais en clair, y compris dans l'interface admin (le champ affiche `••••••••` une fois sauvegardé).
- Vous pouvez à tout moment **révoquer** une clé dans Stripe → **Développeurs** → **Clés API** ; il suffira ensuite d'en saisir une nouvelle dans Eïa.

## Support

Une question ? Contactez **support@lymfea.com** en précisant :
- le nom de votre établissement,
- l'`event_id` Stripe concerné si applicable (visible dans l'onglet *Tentatives*).
