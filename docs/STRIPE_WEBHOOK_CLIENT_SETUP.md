# Configurer le webhook Stripe pour Eïa

> Cette procédure permet à Eïa de recevoir en temps réel les notifications de paiement depuis votre compte Stripe (paiements clients, échecs, lien de paiement, etc.). Sans cette configuration, vos réservations ne basculent pas automatiquement en statut **payé**.

**Durée estimée :** 5 minutes
**Prérequis :** un compte Stripe actif (mode Live) avec accès aux paramètres développeur.

---

## 1. Accéder aux webhooks

1. Connectez-vous à [dashboard.stripe.com](https://dashboard.stripe.com).
2. Vérifiez en haut à gauche que vous êtes bien sur le **bon compte** et en mode **Live** (pas Test).
3. Dans le menu latéral, cliquez sur **Développeurs** → **Webhooks**.
4. Cliquez sur **+ Ajouter un endpoint** (en haut à droite).

## 2. Renseigner l'endpoint Eïa

Dans le formulaire :

| Champ | Valeur à saisir |
|---|---|
| **URL du endpoint** | `https://xfkujlgettlxdgrnqluw.supabase.co/functions/v1/stripe-webhook` |
| **Description** | `Eïa — notifications de paiement` |
| **Version de l'API** | Laissez la version par défaut |

## 3. Sélectionner les évènements à écouter

Cliquez sur **Sélectionner des évènements**, puis cochez exactement les 4 évènements suivants :

- `checkout.session.completed` — paiement réussi via lien Stripe
- `checkout.session.async_payment_failed` — paiement asynchrone échoué (SEPA, virements, etc.)
- `payment_intent.payment_failed` — paiement par carte refusé
- `invoice.payment_succeeded` — facture Stripe payée

> Astuce : utilisez la barre de recherche en haut de la liste pour retrouver chaque évènement plus vite.

Cliquez sur **Ajouter des évènements**, puis sur **Ajouter un endpoint** pour valider.

## 4. Récupérer la clé de signature

Une fois le endpoint créé, Stripe affiche sa page de détail.

1. Repérez la section **Secret de signature** (ou *Signing secret*).
2. Cliquez sur **Révéler**.
3. Copiez la valeur complète, qui commence par `whsec_...`.

> ⚠️ Cette clé est confidentielle — ne la partagez qu'avec l'équipe Eïa via un canal sécurisé (et jamais par e-mail simple).

## 5. Transmettre la clé à Eïa

Envoyez la clé `whsec_...` à votre interlocuteur Eïa, accompagnée :

- du **nom de votre établissement** ;
- de l'**identifiant de compte Stripe** (visible dans Stripe → Paramètres → Compte, format `acct_...`).

Eïa branche la clé en moins de 24 h ouvrées et vous confirme l'activation.

## 6. Vérifier que tout fonctionne

Après confirmation par Eïa :

1. Retournez sur **Développeurs** → **Webhooks** → votre endpoint Eïa.
2. Onglet **Tentatives** : vous devez voir des lignes en vert (`200 OK`) après chaque paiement réel.
3. En cas de paiement test, vous pouvez aussi cliquer sur **Envoyer un évènement de test** et choisir `checkout.session.completed` — Eïa renverra un `200`.

---

## Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| Tentatives en `400 No signature` | Clé de signature non transmise ou mal copiée | Renvoyez la clé `whsec_...` complète à Eïa |
| Tentatives en `400 Bad signature` | Mauvaise clé associée à votre compte | Vérifiez que vous êtes en mode **Live** côté Stripe et renvoyez la clé |
| Aucune tentative ne s'affiche | Évènements non cochés | Cliquez sur **Mettre à jour les évènements** et cochez les 4 évènements ci-dessus |
| Une réservation reste en `en attente` après paiement | Webhook non reçu ou en erreur | Vérifiez l'onglet **Tentatives** ; sinon contactez le support Eïa |

## Support

Une question ? Contactez **support@lymfea.com** en précisant le nom de votre établissement et, si possible, l'`event_id` Stripe concerné (visible dans l'onglet *Tentatives*).
