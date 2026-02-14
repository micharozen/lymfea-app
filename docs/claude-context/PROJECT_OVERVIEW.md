# OOM Hotel - Project Overview

## Description

OOM Hotel est une plateforme SaaS de réservation de services beauté et coiffure en hôtel. Elle connecte les clients d'hôtels avec des professionnels de la beauté via un système de réservation moderne.

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
- Gestion des réservations (calendrier/liste)
- Gestion des coiffeurs et concierges
- Configuration des hôtels et menus de soins
- Rapports financiers et transactions
- Gestion des "trunks" (équipements mobiles)

### 2. PWA Hairdresser (`/pwa/*`)
Application mobile progressive pour les coiffeurs :
- Notifications push en temps réel (OneSignal)
- Gestion des rendez-vous et acceptation/refus
- Wallet et suivi des gains
- Intégration Stripe Connect pour les paiements directs
- Onboarding et gestion du profil

### 3. Client Booking Flow (`/client/:hotelId/*`)
Parcours de réservation pour les clients d'hôtel :
- Accès via QR code depuis la chambre
- Sélection des soins avec panier
- Choix de date/heure et coiffeur
- Paiement Stripe
- Confirmation et gestion de réservation

## Structure des Dossiers

```
oom-app/
├── src/
│   ├── components/          # Composants React réutilisables
│   │   ├── ui/              # shadcn/ui components (48 composants)
│   │   ├── admin/           # Composants admin (dialogs, forms)
│   │   ├── pwa/             # Composants PWA (Layout, TabBar)
│   │   ├── client/          # Composants client booking
│   │   └── booking/         # Composants booking partagés
│   ├── pages/
│   │   ├── admin/           # 13 pages admin
│   │   ├── pwa/             # 15 pages PWA
│   │   ├── client/          # 11 pages client flow
│   │   └── auth/            # Pages authentification
│   ├── hooks/               # 17 hooks personnalisés
│   ├── contexts/            # UserContext, TimezoneContext
│   ├── integrations/supabase/  # Client et types auto-générés
│   ├── lib/                 # Utilitaires (dates, prix, timezones)
│   └── i18n/                # Traductions
├── supabase/
│   ├── functions/           # 40+ Edge Functions
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

- **admin** : Accès complet au dashboard admin
- **concierge** : Accès limité aux hôtels assignés
- **hairdresser** : Accès PWA uniquement
- **guest** : Pas de compte, session temporaire pour booking
