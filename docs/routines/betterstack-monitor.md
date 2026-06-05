# Routine — Better Stack → Slack + Email (monitoring logs Saoma Prod)

> Routine Claude exécutée **toutes les 60 min**. Elle interroge Better Stack via
> son **API** (`curl`), alerte sur **Slack** (MCP) en temps réel, et envoie un
> **récap quotidien par email** (Gmail MCP). Chaque log est expliqué et classé
> par un **indicateur d'impact**.

## Rôle
Surveiller les logs Better Stack, alerter sur Slack en temps réel, et envoyer
un récap quotidien par email. Chaque log est expliqué et classé par un
INDICATEUR D'IMPACT.

## Connexion Better Stack (via call API)
⚠️ **Deux credentials distincts** (c'est volontaire côté Better Stack) :
- Telemetry API (découverte sources) : `https://telemetry.betterstack.com`
  → Auth **Bearer** : header `Authorization: Bearer ${BETTERSTACK_TOKEN}`
- SQL Query API (lecture des logs)    : `https://s2440220.eu-fsn-3.betterstackdata.com`
  → Auth **Basic** : `-u "${BETTERSTACK_QUERY_USERNAME}:${BETTERSTACK_QUERY_PASSWORD}"`

> Le `BETTERSTACK_TOKEN` (Telemetry API) ne donne **PAS** accès à la lecture SQL.
> Les credentials de lecture sont une **connexion ClickHouse HTTP** à créer dans
> Better Stack → Telemetry → Integrations → "Connect ClickHouse HTTP client" →
> Create connection (le password n'est affiché qu'une fois).
>
> Aucun secret n'est écrit ici : tout passe par les variables d'environnement
> `BETTERSTACK_TOKEN`, `BETTERSTACK_QUERY_USERNAME`, `BETTERSTACK_QUERY_PASSWORD`.
> Réseau requis : autoriser `telemetry.betterstack.com` et `*.betterstackdata.com`
> (les `curl` ne passent pas par le proxy des connecteurs, contrairement à
> Slack/Gmail MCP).

### Sources à requêter
| Nom                 | Source Token              | Source ID                |
|---------------------|---------------------------|--------------------------|
| Saoma Prod Frontend | rQUgAthJyX8M71mZ11EvLehP   | rQUgAthJyX8M71mZ11EvLehP |
| Saoma Prod Backend  | est7HCigvgyGbEjLvnbQEnF3   | saoma_prod_backend       |

### Étape 0 — Découverte des tables (1ère fois / si doute)
```bash
curl -s https://telemetry.betterstack.com/api/v2/sources \
  -H "Authorization: Bearer ${BETTERSTACK_TOKEN}" \
| jq -r '.data[] | [.attributes.name, .attributes.table_name] | @tsv'
```
→ Mémoriser `FRONTEND_TABLE` et `BACKEND_TABLE` (ex : `t123456_..._logs`).

## Étape 1 — Récupérer les NOUVEAUX logs error/warning (dernière heure)
Pour CHAQUE source (fenêtre 65 min = 60 min + recouvrement) :
```bash
curl -s -X POST "https://s2440220.eu-fsn-3.betterstackdata.com/?output_format_pretty_row_numbers=0" \
  -u "${BETTERSTACK_QUERY_USERNAME}:${BETTERSTACK_QUERY_PASSWORD}" \
  -H "Content-Type: text/plain" \
  --data-binary "
    SELECT dt,
           getJSONString(raw,'level')   AS level,
           getJSONString(raw,'message') AS message,
           raw
    FROM remote(${BACKEND_TABLE})
    WHERE dt > now() - INTERVAL 65 MINUTE
      AND (lower(getJSONString(raw,'level')) IN ('error','warn','warning','fatal','critical')
           OR raw ILIKE '%error%' OR raw ILIKE '%exception%' OR raw ILIKE '%warning%')
    ORDER BY dt DESC
    LIMIT 200
    FORMAT JSONEachRow"
```
- Dédupliquer par `(dt + message)` pour ne pas réalerter au run suivant.
- Adapter l'extraction du `level` au schéma réel une fois les 1ers logs vus.

## Étape 2 — Alerte Slack immédiate (MCP Slack → canal #saoma_prod)
Si des logs sont trouvés, poster sur **#saoma_prod** :
- 🏷️ Niveau (ERROR / WARNING) + Source (Frontend / Backend)
- 🕒 Heure (fuseau `Europe/Paris`)
- 🧠 Résumé clair de ce qui s'est passé (1–2 phrases, pas le log brut)
- 🚦 INDICATEUR D'IMPACT (voir rubrique ci-dessous)
- Compteur si occurrences répétées ("×7 en 1 h")

Grouper les logs identiques en UNE alerte pour éviter le spam.

## Étape 3 — Email récap quotidien (Gmail MCP)
À **19:00 Europe/Paris**, requêter toute la journée :
```sql
WHERE dt >= toStartOfDay(now(), 'Europe/Paris')
```
Email à **michael@saoma.io**, objet :
`[Saoma] Récap logs du {date} — {N} erreurs / {M} warnings`

Corps groupé PAR SÉVÉRITÉ puis PAR SOURCE ; chaque entrée = résumé +
indicateur d'impact + nb d'occurrences. En tête : mini-tableau 🔴/🟠/🟡/⚪️.

## Étape 4 — Aucun log
Si 0 error/warning sur la journée, envoyer quand même un email court :
`✅ Aucune erreur ni warning aujourd'hui sur Saoma Prod.`

## 🚦 Rubrique — Indicateur d'impact (appliqué à chaque log)
- 🔴 **BLOQUANT UTILISATEUR** : l'utilisateur ne peut pas finir son action
  (paiement KO, booking impossible, page qui crashe, 500 sur route clé,
  auth cassée, edge function en échec).
- 🟠 **DÉGRADÉ** : finit par marcher mais avec accroc (retry, timeout, fallback,
  lenteur, asset manquant).
- 🟡 **FAUSSE MANIP / ATTENDU** : erreur provoquée par l'utilisateur, pas un bug
  (mauvais mot de passe, validation formulaire, 404 lien tapé, code promo
  invalide, double-clic).
- ⚪️ **BRUIT** : log technique sans impact utilisateur.

Pour trancher : code HTTP, route/contexte (client booking, PWA thérapeute,
admin), `user_id`/session impactés, action aboutie ou non. En cas de doute →
niveau supérieur (prudence).

## Variables d'environnement attendues
| Variable | Rôle | Exemple |
|---|---|---|
| `BETTERSTACK_TOKEN` | Bearer Telemetry API — découverte des sources (Étape 0) | *(secret, dans l'env)* |
| `BETTERSTACK_QUERY_USERNAME` | Username connexion ClickHouse HTTP — lecture SQL | `s2440220` |
| `BETTERSTACK_QUERY_PASSWORD` | Password connexion ClickHouse HTTP — lecture SQL | *(secret, affiché 1 fois)* |

Les autres paramètres (email `michael@saoma.io`, heure `19:00`, fuseau
`Europe/Paris`, canal `#saoma_prod`) sont fixés ci-dessus ; les externaliser en
variables d'env si besoin de les changer sans toucher au prompt.
