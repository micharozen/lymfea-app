# Alma BNPL — Prérequis d'intégration

## 1. Compte Merchant Alma

### Inscription
- S'inscrire sur **https://dashboard.getalma.eu/signup** (ou via https://almapay.com)
- Secteur d'activité : Beauté / Bien-être / Spa
- Volume mensuel estimé et panier moyen

### Documents requis (KYC)
- Kbis de la société (< 3 mois)
- RIB du compte professionnel **FR uniquement** (IBAN FR — Alma ne supporte que les comptes bancaires français)
- Statuts de la société
- Pièce d'identité du dirigeant (CNI ou passeport)
- Délai de validation : **1 à 2 semaines** typiquement

### Conditions commerciales
Les taux de commission Alma sont négociés lors du contrat merchant :
- **P2X** (2 fois sans frais) : ~1,5% du montant
- **P3X** (3 fois sans frais) : ~2,5%
- **P4X** (4 fois sans frais) : ~3–4%
- Les frais sont à la charge du merchant (pas du client final)
- Les taux exacts dépendent du volume mensuel négocié

## 2. Clés API & Environnement

### Sandbox (pour le développement)
Demander explicitement l'accès au sandbox lors de l'onboarding Alma. Vous recevrez :
- **Dashboard sandbox** : `https://dashboard.sandbox.getalma.eu`
- **Clé API sandbox** : `sk_test_xxxxxxxxxxxxxxxx`
- **Merchant ID** : `merchant_xxxxxxxxxxxxxxxx`
- **API base URL** : `https://api.sandbox.getalma.eu`

### Production (après validation)
- **Dashboard production** : `https://dashboard.getalma.eu`
- **Clé API live** : `sk_live_xxxxxxxxxxxxxxxx`
- **API base URL** : `https://api.getalma.eu`

## 3. Variables d'environnement Supabase

Configurer via `supabase secrets set` :

```bash
# Clé privée Alma (sk_test_* en sandbox, sk_live_* en production)
supabase secrets set ALMA_API_KEY=sk_test_xxxxxxxxxxxxxxxx

# Mode API : "test" pour sandbox, "live" pour production
supabase secrets set ALMA_API_MODE=test

# Merchant ID (utilisé pour les widgets frontend futurs)
supabase secrets set ALMA_MERCHANT_ID=merchant_xxxxxxxxxxxxxxxx
```

> **SITE_URL** est déjà configuré (utilisé par Stripe). Il est réutilisé pour les `return_url` Alma.

## 4. Cartes de test Alma (sandbox)

| Carte | Comportement |
|---|---|
| `4111 1111 1111 1111` | Paiement accepté |
| `4000 0000 0000 0002` | Paiement refusé |
| Date d'expiration | N'importe quelle date future |
| CVV | N'importe quel code à 3 chiffres |

## 5. Migration base de données

La migration `supabase/migrations/<timestamp>_add_alma_payment.sql` doit être
appliquée avant de déployer les edge functions. Elle ajoute :

- Colonnes `alma_payment_id`, `alma_installments_count`, `provider` dans `booking_payment_infos`
- Extension de la contrainte `bookings.payment_method` pour inclure `'alma'`

## 6. Configuration Supabase (config.toml)

Trois nouvelles edge functions sont déclarées dans `supabase/config.toml` :
- `alma-check-eligibility` — vérification d'éligibilité (public, pas de JWT)
- `alma-create-payment` — création d'un paiement Alma (public, pas de JWT)
- `alma-webhook` — réception des IPN Alma (public, pas de JWT)

## 7. Webhook IPN Alma

Configurer l'URL IPN dans le dashboard Alma (Settings > Webhooks) :
```
https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/alma-webhook
```

> **Sécurité** : L'IPN Alma n'est **pas signée**. La vérification se fait en
> re-fetchant le paiement via `GET /v1/payments/:id` avec la clé API. Ne jamais
> faire confiance au contenu du body de l'IPN seul.

## 8. Checklist avant mise en production

- [ ] Contrat merchant Alma signé
- [ ] KYC validé par Alma
- [ ] Tests fonctionnels OK en sandbox (éligibilité, paiement, webhook, idempotence)
- [ ] Review d'intégration par Alma (ils vérifient le bon usage de l'API)
- [ ] Clé `sk_live_*` obtenue
- [ ] Variables d'environnement prod configurées (`ALMA_API_KEY`, `ALMA_API_MODE=live`)
- [ ] URL webhook IPN configurée en prod dans le dashboard Alma
- [ ] Déploiement des edge functions en production
