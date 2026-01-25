# Supabase Migrations

## Nom des fichiers de migration

Les fichiers de migration SQL doivent être créés directement dans `supabase/migrations/` avec le format suivant:

```
HH:MM_DD_MM_YY_brancheName.sql
```

### Règles:
- **HH:MM**: Heure et minutes (ex: 14:30)
- **DD**: Jour sur 2 chiffres (ex: 25)
- **MM**: Mois sur 2 chiffres (ex: 01)
- **YY**: Année sur 2 chiffres (ex: 26)
- **brancheName**: Nom de la branche Git actuelle (remplacer `/` par `-`)

### Exemple:
Si on est le 25 janvier 2026 à 12:30 sur la branche `feature/venue-opening-hours`:
```
supabase/migrations/12:30_25_01_26_feature-venue-opening-hours.sql
```

### Commande:
```bash
BRANCH=$(git branch --show-current | tr '/' '-')
touch "supabase/migrations/$(date +%H:%M_%d_%m_%y)_${BRANCH}.sql"
```
