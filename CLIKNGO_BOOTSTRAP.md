# Clikngo MVP — bootstrap delivery

Ce fichier `clikngo-bootstrap.tar.gz` à la racine de `lymfea-app` contient
le code Step 1 du nouveau SaaS Clikngo (Next.js 16 + Convex + Better Auth).

Il est livré ici parce que le container Claude Code ne peut pousser que vers
`micharozen/lymfea-app` ; le push direct vers `micharozen/clikngo` doit être
fait depuis ta machine locale.

## Ce qu'il contient

- 25+ fichiers source (convex schema, Better Auth wiring multi-tenant,
  pages placeholder, PWA manifest, intégrations Stripe/Resend/Sentry stubs).
- `package.json` + `bun.lock` (deps installables avec `bun install`).
- `README.md` détaillant le setup manuel (`bunx convex dev`, env vars).
- **Pas** de `node_modules`, `.next`, `convex/_generated`, ou `.git` —
  le repo git du nouveau projet sera créé chez toi.

## Étapes côté ton ordi

```bash
# 1. Pull la branche bootstrap
git pull origin claude/bootstrap-saas-mvp-d6rZJ

# 2. Extraire dans un dossier sibling
mkdir -p ../clikngo
tar -xzf clikngo-bootstrap.tar.gz -C ../clikngo
cd ../clikngo

# 3. Installer les deps
bun install

# 4. Initialiser le repo git et pusher vers micharozen/clikngo
git init -b main
git add -A
git commit -m "feat: bootstrap step 1 — convex schema, better-auth multi-tenant, stripe/resend/sentry stubs, pwa manifest"
git remote add origin https://github.com/micharozen/clikngo.git
git push -u origin main

# 5. Lier Convex (interactif, login + create project)
bunx convex dev

# 6. Cf. README.md pour les bunx convex env set
```

Une fois Convex linké et `.env.local` rempli, ouvrir <http://localhost:3000>
pour voir la page marketing avec le health beacon. Sign-up Better Auth et
test du `tenantPing` valident que l'auth multi-tenant tourne.

## Nettoyage de lymfea-app après extraction

Une fois le code récupéré et poussé sur `micharozen/clikngo`, ce tarball et
ce fichier peuvent être supprimés sur cette branche — ils n'ont aucune
relation avec le code spa de lymfea-app.

```bash
git rm clikngo-bootstrap.tar.gz CLIKNGO_BOOTSTRAP.md
git commit -m "chore: remove clikngo bootstrap delivery artifacts"
```
