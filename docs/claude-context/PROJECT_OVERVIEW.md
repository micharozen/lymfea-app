# Lymfea - Project Overview

## Description

Lymfea est une plateforme SaaS de gestion de spa. Elle permet la réservation en ligne de soins, la coordination des thérapeutes, la gestion d'agenda multi-lieux, et la facturation automatisée. La plateforme connecte trois acteurs : les lieux (hôtels avec spa, spas indépendants), les thérapeutes, et les clients.

## Stack Technique

| Catégorie | Technologies |
|-----------|--------------|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS, shadcn/ui (Radix UI) |
| State | TanStack Query, React Context |
| Forms | React Hook Form, Zod |
| Backend | Supabase (PostgreSQL, Auth, Edge Functions) |
| Paiements | Stripe, Stripe Connect |
| PWA | Vite PWA Plugin, Workbox, OneSignal |
| i18n | i18next (FR/EN) |

## Les 3 Interfaces Utilisateur

### 1. Admin Dashboard (`/admin/*`)

Interface web pour les administrateurs et concierges :

- Dashboard avec analytics et statistiques
- Gestion des réservations (calendrier/liste) avec vues par lieu, salle, thérapeute
- Gestion des thérapeutes et concierges
- Configuration des lieux (hôtels/spas) et menus de soins
- Gestion des salles de soin (anciennement "trunks" dans le code)
- Rapports financiers et transactions
- Facturation automatique

### 2. PWA Thérapeute (`/pwa/*`)

Application mobile progressive pour les thérapeutes :

- Notifications push en temps réel (OneSignal)
- Gestion des rendez-vous et acceptation/refus
- Vue disponibilité des salles en temps réel
- Ajout de prestations supplémentaires depuis le mobile
- Wallet et suivi des gains
- Intégration Stripe Connect pour les paiements directs
- Onboarding et gestion du profil

### 3. Client Booking Flow (`/client/:hotelId/*`)

Parcours de réservation pour les clients :

- Accès via QR code ou lien direct
- Sélection des soins avec panier
- Choix de date/heure et thérapeute (optionnel, avec préférence H/F)
- Paiement Stripe ou facturation en chambre (hôtel uniquement)
- Confirmation et gestion de réservation

## Structure des Dossiers

```
lymfea-app/
├── src/
│   ├── components/          # Composants React réutilisables
│   │   ├── ui/              # shadcn/ui components (48 composants)
│   │   ├── admin/           # Composants admin (dialogs, forms)
│   │   ├── pwa/             # Composants PWA thérapeute (Layout, TabBar)
│   │   ├── client/          # Composants client booking
│   │   └── booking/         # Composants booking partagés
│   ├── pages/
│   │   ├── admin/           # Pages admin dashboard
│   │   ├── pwa/             # Pages PWA thérapeute
│   │   ├── client/          # Pages client flow
│   │   └── auth/            # Pages authentification
│   ├── hooks/               # Hooks personnalisés
│   ├── contexts/            # UserContext, TimezoneContext
│   ├── integrations/supabase/  # Client et types auto-générés
│   ├── lib/                 # Utilitaires (dates, prix, timezones)
│   └── i18n/                # Traductions FR/EN
├── supabase/
│   ├── functions/           # 40+ Edge Functions (Deno)
│   ├── migrations/          # Migrations SQL
│   └── config.toml          # Configuration Supabase
└── public/                  # Assets PWA, manifest, service-worker
```

## Fichiers de Configuration Clés

| Fichier | Rôle |
|---------|------|
| `src/App.tsx` | Routing principal et lazy loading |
| `src/integrations/supabase/types.ts` | Types DB auto-générés |
| `supabase/config.toml` | Config Supabase et Edge Functions |
| `vite.config.ts` | Build, PWA, code splitting |
| `tailwind.config.ts` | Theme, couleurs, dark mode |

## Rôles Utilisateur

| Rôle | Accès | Note legacy |
|------|-------|-------------|
| **admin** | Accès complet au dashboard admin | — |
| **concierge** | Accès limité aux hôtels assignés | — |
| **therapist** | Accès PWA uniquement | En DB : `hairdresser` (migration à venir) |
| **guest** | Pas de compte, session temporaire pour booking | — |

## Types de Lieux

| Type | Description | Paiement en chambre |
|------|-------------|---------------------|
| `hotel` | Spa d'hôtel (le client est un résident) | Oui |
| `spa` | Spa indépendant / day spa | Non |
