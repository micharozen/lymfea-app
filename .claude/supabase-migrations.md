# Supabase Migrations

## Nom des fichiers de migration

Les fichiers de migration SQL doivent être créés directement dans `supabase/migrations/` avec le format **standard Supabase**:

```
YYYYMMDDHHMM00_description.sql
```

### Règles:
- **YYYY**: Année sur 4 chiffres (ex: 2026)
- **MM**: Mois sur 2 chiffres (ex: 01)
- **DD**: Jour sur 2 chiffres (ex: 25)
- **HH**: Heure sur 2 chiffres (ex: 14)
- **MM**: Minutes sur 2 chiffres (ex: 30)
- **00**: Secondes (toujours 00)
- **description**: Description courte en kebab-case

### Exemple:
Si on est le 25 janvier 2026 à 12:30:
```
supabase/migrations/20260125123000_add-venue-opening-hours.sql
```

### Commande:
```bash
touch "supabase/migrations/$(date +%Y%m%d%H%M00)_description.sql"
```

### Pourquoi ce format?
- C'est le format standard attendu par Supabase CLI
- Le tri alphabétique = tri chronologique (important pour l'ordre d'exécution)
- Évite les erreurs "migration history mismatch" lors des changements de branche
