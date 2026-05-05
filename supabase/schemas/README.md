# Schémas déclaratifs Supabase

Ce dossier contient l'**état désiré** du schéma `public` de la DB Lymfea.
Au lieu d'écrire des migrations à la main, on édite ces fichiers et Supabase
génère les migrations correspondantes via `supabase db diff`.

## Structure

Les fichiers sont chargés par ordre alphabétique. Les préfixes numériques
encodent l'ordre de dépendance :

| Préfixe | Contenu | Pourquoi à cette position |
|---|---|---|
| `00_extensions.sql` | `CREATE EXTENSION` | Doit exister avant tout |
| `01_schema.sql` | `CREATE SCHEMA`, `GRANT USAGE`, `ALTER DEFAULT PRIVILEGES` | Setup de base |
| `02_types.sql` | `CREATE TYPE` (enums) | Référencés par les colonnes |
| `03_sequences.sql` | `CREATE SEQUENCE` | Référencées par les `DEFAULT nextval(...)` |
| `10_<table>.sql` | Une table par fichier — `CREATE TABLE` + indexes + comments + grants + ENABLE RLS + own-table constraints | Avant les FKs, fonctions, policies, triggers |
| `80_functions.sql` | Toutes les fonctions et leurs grants/comments | Après les tables (référencées dans les bodies) |
| `85_foreign_keys.sql` | `ALTER TABLE ADD CONSTRAINT FK references ...` | Toutes les tables doivent exister |
| `90_policies.sql` | `CREATE POLICY` | USING/WITH CHECK peuvent référencer d'autres tables et fonctions |
| `95_triggers.sql` | `CREATE TRIGGER` + comments | Référencent les fonctions |

Une table = un fichier `10_<nom>.sql` (~50 fichiers).

## Workflow pour modifier le schéma

1. **Éditer** le bon fichier :
   - Ajouter une colonne / index → `10_<table>.sql`
   - Modifier une fonction → `80_functions.sql`
   - Ajouter une FK → `85_foreign_keys.sql`
   - Nouvelle policy → `90_policies.sql`
   - Nouveau trigger → `95_triggers.sql`
2. **Générer la migration** :
   ```bash
   supabase db diff --local --schema public -f nom_du_changement
   ```
   Crée `supabase/migrations/<timestamp>_nom_du_changement.sql`.
3. **Inspecter la migration générée** — surtout pour les renames (souvent émis
   comme DROP+CREATE, à corriger en `ALTER ... RENAME`) et les data migrations
   (à ajouter manuellement).
4. **Tester localement** : `supabase db reset --local`.
5. **Commit** les deux fichiers : le schéma modifié **et** la migration générée.

## Limites connues

### Faux positifs récurrents dans `db diff`
Deux items apparaissent toujours comme "drop" même quand le schéma est cohérent :
- `drop policy "Block direct access to gift code attempts" on "public"."gift_code_attempts"` — bug Supabase sur les policies `RESTRICTIVE`
- `drop extension if exists "unaccent"` — bug de comparaison d'extensions cross-schema

**Action** : ignorer/supprimer ces deux items des migrations générées.

### Renames
`db diff` détecte mal les renames → DROP + CREATE au lieu de `ALTER RENAME`.
Toujours réécrire à la main quand on renomme.

### Data migrations
Le déclaratif gère la **structure** uniquement. Pour les backfills, écrire le
SQL impératif manuellement dans la migration générée.

### Schémas non-`public`
Couvre uniquement `public`. Modifications sur `storage`, `auth`, etc. restent
en migrations impératives à la main.

## Régénérer le baseline depuis zéro

Si tu veux re-dumper depuis la DB locale (par exemple après une grosse refonte) :

```bash
supabase db reset --local
supabase db dump --local --schema public -f /tmp/dump.sql
# puis lancer le script de split (voir tools/split_schema.py si gardé)
```

## Migrations historiques

Les ~116 migrations dans `supabase/migrations/` antérieures à ce setup restent
telles quelles (historique de prod). Le set de fichiers actuel représente
l'état après application de toutes ces migrations.
