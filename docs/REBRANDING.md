# Guide de Rebranding - Onboarding nouveau client

Ce guide explique comment adapter l'application pour un nouveau client (marque blanche).

## Architecture du branding

```
src/config/brand.json                          <-- SEUL FICHIER A MODIFIER
  ├── src/config/brand.ts                      <-- Wrapper TS (auto, rien a faire)
  ├── supabase/functions/_shared/brand.json    <-- Copie pour Edge Functions (script)
  ├── public/manifest.webmanifest              <-- Genere par script
  └── public/admin-manifest.webmanifest        <-- Genere par script
```

---

## Etape 1 : Modifier `src/config/brand.json`

C'est le fichier central. Ouvrir et adapter toutes les valeurs :

```jsonc
{
  // --- Identite ---
  "name": "NouveauClient",                        // Nom court (sidebar, headers, alt images)
  "tagline": "Slogan du client",                   // Ex: "Luxury in Motion"
  "fullName": "NouveauClient - Slogan du client",  // Titre complet (onglet navigateur, PWA)

  "description": {
    "fr": "Description courte en francais",         // Meta description + manifests
    "en": "Short description in English"
  },

  "website": "https://nouveauclient.com",           // Lien "Powered by" dans le footer
  "appDomain": "app.nouveauclient.com",             // Domaine de l'app en production

  // --- Infos legales (CGU, mentions legales, politique de confidentialite) ---
  "legal": {
    "companyName": "NOUVEAUCLIENT SAS",
    "companyType": "SAS (Societe par Actions Simplifiee)",
    "companyTypeEn": "SAS (Simplified Joint Stock Company)",
    "capital": "10 000 EUR",
    "siren": "XXX XXX XXX",
    "siret": "XXX XXX XXX XXXXX",
    "rcs": "XXX XXX XXX",
    "vatNumber": "FRXXXXXXXXXX",
    "address": "1 rue de Example, 75001 Paris, France",
    "director": "Prenom Nom",
    "contactEmail": "contact@nouveauclient.com",
    "bookingEmail": "booking@nouveauclient.com",
    "phone": "+33 X XX XX XX XX",
    "host": {
      "name": "OVHcloud",                           // Hebergeur du site
      "address": "2 rue Kellermann, 59100 Roubaix, France"
    }
  },

  // --- Configuration emails (Edge Functions Resend) ---
  "emails": {
    "from": {
      "default": "NouveauClient <booking@nouveauclient.com>",
      "noreply": "NouveauClient <noreply@nouveauclient.com>",
      "transactional": "NouveauClient Booking <noreply@transactional.nouveauclient.com>"
    },
    "adminRecipient": "admin@nouveauclient.com",     // Recoit les emails admin
    "bookingRecipient": "booking@nouveauclient.com"   // Recoit les notifications de booking
  },

  // --- Chemins des logos (ne pas changer les noms de fichiers) ---
  "logos": {
    "primary": "/assets/brand-logo.svg",
    "monogram": "/assets/brand-monogram.svg",
    "monogramWhite": "/assets/brand-monogram-white.svg",
    "monogramBlack": "/assets/brand-monogram-black.svg",
    "monogramWhiteClient": "/assets/brand-monogram-white-client.svg",
    "emailLogo": "/images/brand-logo-email.png",
    "emailLogoWhite": "/images/brand-logo-email-white.png",
    "ogImage": "/images/brand-og-image.png",
    "secondaryBlack": "/images/brand-logo-secondary-black.svg"
  },

  // --- PWA (noms affiches sur l'ecran d'accueil mobile) ---
  "pwa": {
    "therapist": {
      "name": "NouveauClient - Slogan",
      "shortName": "NouveauClient",
      "description": {
        "fr": "Description FR",
        "en": "Description EN"
      }
    },
    "admin": {
      "name": "NouveauClient Admin",
      "shortName": "NouveauClient Admin",
      "description": {
        "fr": "NouveauClient Admin - Gestion des reservations",
        "en": "NouveauClient Admin - Booking Management"
      }
    }
  },

  // --- Cles localStorage (prefixe unique par client) ---
  "storageKeys": {
    "guestSession": "nouveauclient-guest-session",
    "analyticsSession": "nouveauclient-analytics-session",
    "trackedPages": "nouveauclient-tracked-pages",
    "debug": "nouveauclient-debug",
    "venueLangPrefix": "nouveauclient-venue-lang-applied"
  }
}
```

---

## Etape 2 : Remplacer les fichiers logos

### Logos SVG (interface web)

Remplacer ces fichiers en gardant les memes noms :

| Fichier | Usage | Format recommande |
|---------|-------|-------------------|
| `src/assets/brand-logo.svg` | Logo principal (sidebar, login, onboarding) | SVG, ~200x50px |
| `src/assets/brand-monogram.svg` | Monogramme (splash, home) | SVG, carre ~100x100px |
| `src/assets/brand-monogram-white.svg` | Monogramme blanc (fonds sombres) | SVG, idem fond transparent |
| `src/assets/brand-monogram-black.svg` | Monogramme noir (fonds clairs) | SVG, idem |
| `src/assets/brand-monogram-white-client.svg` | Monogramme client booking (fond dore) | SVG, idem |

### Images PNG (emails, OG, PWA)

| Fichier | Usage | Format recommande |
|---------|-------|-------------------|
| `public/images/brand-logo-email.png` | Logo dans les emails | PNG, ~240x60px, fond transparent |
| `public/images/brand-logo-email-white.png` | Logo email sur fond sombre | PNG, idem |
| `public/images/brand-og-image.png` | Image OpenGraph (partage reseaux sociaux) | PNG, 1200x630px |
| `public/images/brand-logo-secondary-black.svg` | Logo secondaire noir | SVG |

### Favicons et icones PWA

| Fichier | Taille |
|---------|--------|
| `public/favicon.ico` | 48x48 |
| `public/favicon-16x16.png` | 16x16 |
| `public/favicon-32x32.png` | 32x32 |
| `public/apple-touch-icon.png` | 180x180 |
| `public/pwa-64x64.png` | 64x64 |
| `public/pwa-192x192.png` | 192x192 |
| `public/pwa-512x512.png` | 512x512 |
| `public/maskable-icon-512x512.png` | 512x512 (zone safe au centre) |

> **Astuce** : Utiliser https://favicon.io ou https://realfavicongenerator.net pour generer tous les formats depuis un logo unique.

---

## Etape 3 : Uploader le logo email sur Supabase Storage

Les Edge Functions utilisent une URL Supabase Storage pour afficher le logo dans les emails :

1. Aller dans **Supabase Dashboard > Storage > Bucket `assets`**
2. Uploader le nouveau `brand-logo-email.png`
3. Copier l'URL publique (elle ressemble a `https://xxxxx.supabase.co/storage/v1/object/public/assets/brand-logo-email.png`)
4. Mettre a jour l'URL dans les Edge Functions :

```bash
# Rechercher toutes les references a l'ancien logo
grep -r "supabase.co/storage.*logo" supabase/functions/
```

Fichiers concernes (~13 fonctions) :
- `notify-concierge-booking`, `notify-concierge-completion`, `notify-concierge-room-payment`
- `notify-booking-confirmed`, `notify-admin-new-booking`, `notify-admin-quote-pending`
- `send-booking-confirmation`, `send-quote-email`, `send-rating-email`
- `contact-admin`, `invite-admin`, `handle-quote-response`, `generate-invoice`

> **Note** : A terme, cette URL devrait etre centralisee dans `brand.json` sous une cle `emails.logoUrl`. Pour l'instant il faut faire un rechercher-remplacer dans les Edge Functions.

---

## Etape 4 : Configurer les services externes

### 4.1 DNS et domaine

- Configurer le DNS de `app.nouveauclient.com` pour pointer vers l'hebergement
- Ajouter le domaine dans Supabase (Authentication > URL Configuration)

### 4.2 Resend (emails transactionnels)

- Ajouter et verifier le domaine `nouveauclient.com` dans Resend
- Les sous-domaines `transactional.nouveauclient.com` doivent avoir les records DNS (SPF, DKIM, DMARC)

### 4.3 OneSignal (notifications push)

- Creer une nouvelle app dans OneSignal ou ajouter le domaine `app.nouveauclient.com`
- Mettre a jour l'`appId` dans `src/hooks/useOneSignal.ts` si c'est une nouvelle app OneSignal

### 4.4 Stripe

- Configurer le compte Stripe pour le nouveau client si necessaire
- Mettre a jour les cles Stripe dans les variables d'environnement Supabase

---

## Etape 5 : Executer le script de rebrand

```bash
npm run rebrand
```

Cela fait 2 choses :
1. **`sync:brand`** : Copie `brand.json` vers `supabase/functions/_shared/brand.json`
2. **`generate:manifests`** : Regenere `manifest.webmanifest` et `admin-manifest.webmanifest`

---

## Etape 6 : Verifier

### Build

```bash
bun run build
```

### Verifications manuelles

- [ ] `dist/index.html` contient le bon titre et les bonnes meta
- [ ] Ouvrir l'app en local (`bun dev`) et verifier :
  - [ ] Logo sidebar correct
  - [ ] Page login : bon logo, bon nom
  - [ ] Splash PWA : bon monogramme
  - [ ] Footer emails (envoyer un email test)
- [ ] PWA : installer sur mobile, verifier nom + icone
- [ ] Notifications push fonctionnent

### Verifier qu'il ne reste pas de references a l'ancien nom

```bash
# Dans le frontend (ne doit retourner que des faux positifs : noms de tables DB, commentaires)
grep -ri "anciennom" src/

# Dans les Edge Functions
grep -ri "anciennom" supabase/functions/
```

---

## Etape 7 : Deployer

1. Commit et push
2. Deployer les Edge Functions : `supabase functions deploy`
3. Deployer le frontend (CI/CD ou manuellement)

---

## Checklist rapide

```
[ ] 1. brand.json modifie (nom, legal, emails, PWA, storageKeys)
[ ] 2. Logos SVG remplaces (5 fichiers dans src/assets/)
[ ] 3. Images PNG remplacees (3 fichiers dans public/images/)
[ ] 4. Favicons + icones PWA remplaces (8 fichiers dans public/)
[ ] 5. Logo email uploade sur Supabase Storage
[ ] 6. URL du logo email mise a jour dans les Edge Functions
[ ] 7. Services externes configures (DNS, Resend, OneSignal, Stripe)
[ ] 8. npm run rebrand execute
[ ] 9. Build OK (bun run build)
[ ] 10. Verification visuelle OK
[ ] 11. Deploy
```
