# Automatisation Asana → GitHub → PR draft

Pipeline qui transforme les retours/bugs déposés dans Asana en correctifs proposés
automatiquement, avec un garde-fou humain avant tout codage.

```
Asana (projet Retours/Bugs)
  │  cron 15 min — .github/workflows/asana-sync.yml
  ▼
scripts/asana-to-github.mts ──► issue GitHub (labels `asana` + `bug`)
  │                              marqueur <!-- asana-gid:123 --> = idempotence
  └──► commentaire sur la tâche Asana avec le lien de l'issue

Issue GitHub
  │  ← tu poses le label `claude:fix`   (garde-fou : rien ne part sans ton feu vert)
  ▼
.github/workflows/claude-fix-issue.yml
  │  Claude Code headless + bun lint / tsc / test
  ▼
branche auto/issue-N ──► PR en DRAFT (Closes #N) + commentaire sur l'issue
```

## Configuration

### 1. Token Asana

Crée un Personal Access Token sur <https://app.asana.com/0/my-apps> →
*Personal access tokens* → *Create new token*.

Ajoute-le dans **Settings → Secrets and variables → Actions → Secrets** :

| Secret | Valeur |
|---|---|
| `ASANA_PAT` | le token créé |

### 2. GID du projet Asana

Ouvre le projet dans Asana et lis son URL. Attention, deux formats coexistent et le
piège est de prendre le GID du **workspace** au lieu de celui du projet :

```
# Format actuel — le GID du projet suit le segment /project/
https://app.asana.com/1/1206237091095038/project/1216053482753162/list
                          ^workspace              ^projet ← celui-ci

# Ancien format — le GID du projet est le nombre du milieu
https://app.asana.com/0/1216053482753162/list
                        ^projet ← celui-ci
```

En cas de doute, la liste des projets accessibles au token :

```bash
curl -s -H "Authorization: Bearer $ASANA_PAT" \
  "https://app.asana.com/api/1.0/projects?opt_fields=name&limit=100" \
  | jq -r '.data[] | "\(.gid)  \(.name)"'
```

Ajoute-le dans **Settings → Secrets and variables → Actions**, onglet **Variables**
de préférence — ce n'est pas une donnée sensible, et une valeur rangée en Secret est
masquée en `***` dans les logs, ce qui gêne le diagnostic.

| Clé | Valeur | Requis |
|---|---|---|
| `ASANA_PROJECT_GID` | le GID du projet | oui |
| `ASANA_TAG_FILTER` | ex. `bug` — ne synchronise que les tâches portant ce tag | non |

Le workflow lit `${{ vars.X || secrets.X }}`, donc les deux onglets fonctionnent.
Attention : `vars.` et `secrets.` sont deux espaces de noms distincts, et `vars.` ne
voit rien de ce qui est rangé en Secret. Une clé posée dans le mauvais onglet sans ce
fallback arriverait vide, sans autre message que `Variable d'environnement manquante`.

### 3. Stockage des pièces jointes (aperçu des images dans l'issue)

Les captures d'écran jointes aux tâches Asana sont recopiées dans un bucket Supabase
public, puis intégrées en Markdown dans l'issue pour s'afficher en aperçu.

Ce détour est nécessaire : le `download_url` d'Asana est une URL signée qui expire au
bout d'environ une heure, et le dépôt étant privé, GitHub ne rend une image que si son
proxy peut la récupérer sans authentification.

Le bucket `asana-attachments` est créé par la migration
`20260831090000_asana_attachments_storage_bucket.sql` — lecture publique, écriture
réservée au service role.

| Emplacement | Clé | Valeur |
|---|---|---|
| Variables (ou Secrets) | `SUPABASE_URL` | `https://<ref>.supabase.co` |
| Secrets | `SUPABASE_SERVICE_ROLE_KEY` | clé service role du projet |

Sans ces deux valeurs, la synchro continue de fonctionner : les pièces jointes
apparaissent alors comme des liens vers Asana, sans aperçu.

Les fichiers non-image (logs, PDF) ne sont jamais recopiés — ils restent des liens vers
Asana. Plafonds : 5 pièces jointes par tâche, 10 Mo par fichier.

> La service role key contourne RLS et donne un accès complet au projet. Elle n'est
> utilisée ici que pour écrire dans ce bucket, mais garde ça en tête au moment de
> décider qui peut lancer des workflows sur ce dépôt.

### 4. Token GitHub pour la CI sur les PR draft

GitHub bloque volontairement l'enchaînement de workflows : une PR ouverte avec le
`GITHUB_TOKEN` par défaut **ne déclenche pas** la CI. Pour que les PR draft soient
testées automatiquement, ajoute un PAT (scope `repo`) :

| Secret | Effet |
|---|---|
| `AUTOMATION_TOKEN` | absent → la PR draft est créée mais la CI ne tourne pas dessus ; présent → CI normale |

`ANTHROPIC_API_KEY` est déjà configuré (utilisé par `nightly-migration.yml`).

## Utilisation

### Premier run — commence par un dry-run

Le plafond `--limit` (10 par défaut) évite qu'un projet Asana chargé ne crée des
dizaines d'issues d'un coup. Avant d'activer le cron, vérifie ce qui partirait :

**Actions → Asana → GitHub issues → Run workflow**, coche `dry_run`.

En local :

```bash
export ASANA_PAT=...
export ASANA_PROJECT_GID=...
export GITHUB_TOKEN=...
export GITHUB_REPOSITORY=micharozen/lymfea-app

bun run asana:sync -- --dry-run
bun run asana:sync -- --since 2026-08-01   # ignore l'historique ancien
bun run asana:sync -- --limit 50
```

### Faire coder un correctif

Sur une issue synchronisée, pose le label **`claude:fix`**. Le workflow :

1. refuse si `auto/issue-N` existe déjà (pas de PR en double) ;
2. lance Claude Code avec le contenu de l'issue et les conventions de `CLAUDE.md` ;
3. lance `bun run lint`, `bunx tsc --noEmit`, `bun run test` et reporte le résultat
   dans le corps de la PR ;
4. ouvre la PR en **draft** vers `main` et commente l'issue avec son lien.

Si le rapport est trop vague, Claude ne modifie aucun fichier : il commente l'issue
avec son analyse au lieu d'ouvrir une PR à l'aveugle.

## Ce que le pipeline ne fait pas

- **Il ne merge rien.** Les PR sont en draft, à relire avant de passer en ready.
- **Il ne reproduit pas le bug.** Le correctif est déduit du seul rapport écrit —
  d'où le draft.
- **Il ne réécrit pas le statut Asana.** Le seul écrit côté Asana est le commentaire
  contenant le lien de l'issue. Fermer la tâche reste manuel.
- **Il ne resynchronise pas une tâche modifiée.** L'issue est créée une fois ; les
  échanges ultérieurs se font sur l'issue GitHub.

## Note de sécurité

Le titre et le corps de l'issue sont du contenu externe. Ils transitent par des
variables d'environnement et jamais par une interpolation `${{ }}` dans un `run:`,
sinon une tâche Asana piégée pourrait exécuter des commandes dans le runner.

Ce contenu reste en revanche du texte soumis à Claude : quelqu'un ayant accès au
projet Asana pourrait y glisser des instructions. C'est la raison d'être du double
garde-fou — le label manuel et la PR en draft.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| Aucune issue créée, log « Rien à synchroniser » | toutes les tâches ouvertes ont déjà leur marqueur, ou `ASANA_TAG_FILTER` ne matche rien |
| `Asana GET /tasks → 401` | `ASANA_PAT` expiré ou absent |
| `Asana GET /tasks → 404` | mauvais `ASANA_PROJECT_GID` (souvent le GID du workspace pris par erreur, voir §2), ou le token n'a pas accès au projet |
| Des doublons apparaissent | une issue synchronisée a perdu son label `asana` — le script ne la voit plus |
| La PR draft n'a pas de CI | `AUTOMATION_TOKEN` absent (voir §4) |
| Les images apparaissent en liens Asana, pas en aperçu | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` absents, ou la migration du bucket n'est pas appliquée (voir §3) |
| `Upload Supabase échoué (400)` | bucket `asana-attachments` inexistant sur l'environnement ciblé |
| Une pièce jointe manque à l'appel | plus de 5 pièces jointes sur la tâche, fichier au-delà de 10 Mo, ou fichier non-image |
| Le label `claude:fix` ne déclenche rien | le label a été posé par un bot/token : GitHub n'émet pas l'événement |
