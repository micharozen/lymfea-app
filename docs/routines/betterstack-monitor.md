# Routine — Better Stack → Slack + Email (monitoring logs Saoma Prod)

> Routine Claude exécutée **toutes les 60 min**. Elle interroge Better Stack via
> son **API SQL** (`curl`), alerte sur **Slack** (MCP) en temps réel, et envoie
> un **récap quotidien par email** (Gmail MCP). Chaque log est expliqué et
> classé par un **indicateur d'impact**.

## Rôle
Surveiller les logs Better Stack, alerter sur Slack en temps réel, et envoyer
un récap quotidien par email. Chaque log est expliqué et classé par un
INDICATEUR D'IMPACT.

## Connexion Better Stack (via call API SQL)
- Endpoint lecture des logs : `https://eu-fsn-3-connect.betterstackdata.com`
- Auth **Basic** : `-u "${BETTERSTACK_QUERY_USERNAME}:${BETTERSTACK_QUERY_PASSWORD}"`
- Header : `Content-type: text/plain`, méthode `POST`, query en `--data-binary`.

> Ces credentials = une **connexion ClickHouse HTTP** (Better Stack → Telemetry →
> Integrations → "Connect ClickHouse HTTP client"). Ce n'est PAS le Telemetry API
> token. Aucun secret n'est écrit ici : tout passe par les variables d'env
> `BETTERSTACK_QUERY_USERNAME` et `BETTERSTACK_QUERY_PASSWORD`.
>
> Réseau requis : autoriser `*.betterstackdata.com` (les `curl` ne passent pas
> par le proxy des connecteurs, contrairement à Slack/Gmail MCP).

### Tables à requêter (connues — production uniquement)
| Source              | Table logs (ClickHouse)            |
|---------------------|------------------------------------|
| Saoma Prod Backend  | `t542270_saoma_prod_backend_logs`  |
| Saoma Prod Frontend | `t542270_saoma_prod_frontend_logs` |

> On ignore volontairement `t542270_saoma_staging_backend` et
> `t542270_saoma_front_end` (non-prod).
> Syntaxe d'accès : `remote(<table>)`. Colonnes de base : `dt`, `raw`.

### (Optionnel) Sonde de schéma — à lancer 1× pour caler l'extraction
Pour voir la structure réelle de `raw` (et confirmer le champ de niveau) :
```bash
curl -s -u "${BETTERSTACK_QUERY_USERNAME}:${BETTERSTACK_QUERY_PASSWORD}" \
  -H 'Content-type: text/plain' -X POST \
  "https://eu-fsn-3-connect.betterstackdata.com?output_format_pretty_row_numbers=0" \
  --data-binary "SELECT dt, raw FROM remote(t542270_saoma_prod_backend_logs) ORDER BY dt DESC LIMIT 5 FORMAT JSONEachRow"
```
→ Adapter ensuite l'extraction `level`/`message` au format réel observé.

## Étape 1 — Récupérer les NOUVEAUX logs error/warning (dernière heure)
Pour CHAQUE table (backend puis frontend), fenêtre 65 min = 60 min + recouvrement :
```bash
curl -s -u "${BETTERSTACK_QUERY_USERNAME}:${BETTERSTACK_QUERY_PASSWORD}" \
  -H 'Content-type: text/plain' -X POST \
  "https://eu-fsn-3-connect.betterstackdata.com?output_format_pretty_row_numbers=0" \
  --data-binary "
    SELECT dt,
           getJSONString(raw,'level')   AS level,
           getJSONString(raw,'message') AS message,
           raw
    FROM remote(t542270_saoma_prod_backend_logs)
    WHERE dt > now() - INTERVAL 65 MINUTE
      AND (lower(getJSONString(raw,'level')) IN ('error','warn','warning','fatal','critical')
           OR raw ILIKE '%error%' OR raw ILIKE '%exception%' OR raw ILIKE '%warning%')
    ORDER BY dt DESC
    LIMIT 200
    FORMAT JSONEachRow"
```
- Répéter avec `t542270_saoma_prod_frontend_logs`.
- Dédupliquer par `(dt + message)` pour ne pas réalerter au run suivant.
- Adapter l'extraction du `level` au schéma réel (voir sonde ci-dessus).

## Étape 2 — Alerte Slack immédiate (MCP Slack → canal #saoma_prod)
Si des logs sont trouvés, poster sur **#saoma_prod** :
- 🏷️ Niveau (ERROR / WARNING) + Source (Frontend / Backend)
- 🕒 Heure (fuseau `Europe/Paris`)
- 🧠 Résumé clair de ce qui s'est passé (1–2 phrases, pas le log brut)
- 🚦 INDICATEUR D'IMPACT (voir rubrique ci-dessous)
- Compteur si occurrences répétées ("×7 en 1 h")

Grouper les logs identiques en UNE alerte pour éviter le spam.

## Étape 3 — Email récap quotidien (Gmail MCP)
À **19:00 Europe/Paris**, requêter toute la journée (sur les 2 tables) :
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
| `BETTERSTACK_QUERY_USERNAME` | Username connexion ClickHouse HTTP (lecture SQL) | `u6MSmFI6…` |
| `BETTERSTACK_QUERY_PASSWORD` | Password connexion ClickHouse HTTP (lecture SQL) | *(secret, affiché 1 fois)* |

> `BETTERSTACK_TOKEN` (Telemetry API) n'est plus nécessaire : les tables sont
> connues, donc on n'a plus besoin de l'étape de découverte par le Telemetry API.

Autres paramètres fixés ci-dessus : email `michael@saoma.io`, heure `19:00`,
fuseau `Europe/Paris`, canal `#saoma_prod`.
