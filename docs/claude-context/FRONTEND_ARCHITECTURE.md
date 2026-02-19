# Lymfea - Frontend Architecture

> **Note legacy** : Les noms de routes, composants et fichiers utilisent encore la terminologie OOM (hairdresser, trunk, etc.). Voir `CLAUDE.md` section "Legacy Naming" pour le mapping.

## Structure des Routes

### Admin Dashboard (`/admin/*`)

| Route | Page | Protection |
|-------|------|------------|
| `/admin/dashboard` | Dashboard analytics | AdminProtectedRoute |
| `/admin/bookings` | Gestion réservations (calendrier/liste) | AdminProtectedRoute |
| `/admin/hairdressers` | Gestion thérapeutes _(route legacy, à renommer `/admin/therapists`)_ | AdminProtectedRoute |
| `/admin/places` | Gestion lieux (hôtels/spas) | AdminProtectedRoute |
| `/admin/treatments` | Menu des soins | AdminProtectedRoute |
| `/admin/trunks` | Salles de soin _(route legacy, à renommer `/admin/rooms`)_ | AdminProtectedRoute |
| `/admin/concierges` | Gestion concierges | AdminProtectedRoute |
| `/admin/products` | Produits (retail) | AdminProtectedRoute |
| `/admin/orders` | Commandes | AdminProtectedRoute |
| `/admin/finance` | Dashboard financier | AdminProtectedRoute |
| `/admin/transactions` | Historique transactions | AdminProtectedRoute |
| `/admin/analytics` | Analytics & funnel | AdminProtectedRoute |
| `/admin/settings` | Paramètres | AdminProtectedRoute |
| `/admin/profile` | Profil admin | AdminProtectedRoute |

### Admin PWA (`/admin-pwa/*`)

Vue mobile optimisée pour admins/concierges en mode PWA installé.

| Route | Page | Protection |
|-------|------|------------|
| `/admin-pwa/accueil` | Accueil admin mobile | AdminProtectedRoute |
| `/admin-pwa/dashboard` | Dashboard mobile | AdminProtectedRoute |
| `/admin-pwa/booking/:id` | Détail réservation | AdminProtectedRoute |
| `/admin-pwa/create` | Créer réservation | AdminProtectedRoute |
| `/admin-pwa/notifications` | Notifications | AdminProtectedRoute |
| `/admin-pwa/install` | Guide installation PWA | Public |

### PWA Thérapeute (`/pwa/*`)

_(Legacy : "Hairdresser PWA" dans le code)_

| Route | Page | Protection |
|-------|------|------------|
| `/pwa/splash` | Splash screen | Public |
| `/pwa/welcome` | Accueil | Public |
| `/pwa/login` | Connexion | Public |
| `/pwa/install` | Guide installation PWA | Public |
| `/pwa/onboarding` | Onboarding thérapeute | HairdresserProtectedRoute |
| `/pwa/dashboard` | Home + réservations du jour | HairdresserProtectedRoute |
| `/pwa/bookings` | Liste réservations | HairdresserProtectedRoute |
| `/pwa/booking/:id` | Détail réservation | HairdresserProtectedRoute |
| `/pwa/new-booking` | Créer réservation | HairdresserProtectedRoute |
| `/pwa/notifications` | Notifications | HairdresserProtectedRoute |
| `/pwa/hotels` | Lieux affiliés | HairdresserProtectedRoute |
| `/pwa/wallet` | Wallet / gains Stripe | HairdresserProtectedRoute |
| `/pwa/profile` | Profil thérapeute | HairdresserProtectedRoute |
| `/pwa/account-security` | Sécurité compte | HairdresserProtectedRoute |
| `/pwa/stripe-callback` | Retour Stripe Connect | HairdresserProtectedRoute |

### Client Booking Flow (`/client/:hotelId/*`)

| Route | Page |
|-------|------|
| `/client/:hotelId` | Welcome page (infos lieu, branding) |
| `/client/:hotelId/treatments` | Sélection soins par catégorie |
| `/client/:hotelId/schedule` | Date/heure/thérapeute |
| `/client/:hotelId/guest-info` | Infos client (nom, téléphone, chambre) |
| `/client/:hotelId/payment` | Méthode paiement (Stripe / chambre) |
| `/client/:hotelId/checkout` | Récapitulatif & confirmation |
| `/client/:hotelId/confirmation/:bookingId` | Confirmation finale |

### Routes Publiques

| Route | Page |
|-------|------|
| `/` | Redirect selon rôle utilisateur |
| `/booking/manage/:bookingId` | Gérer sa réservation (client) |
| `/booking/confirmation/:bookingId` | Confirmation paiement (lien externe) |
| `/rate/:token` | Noter un thérapeute (lien email) |
| `/quote-response` | Réponse à un devis |
| `/enterprise/:hotelId` | Dashboard entreprise (legacy, à évaluer) |

## React Contexts

### UserContext (`src/contexts/UserContext.tsx`)

```typescript
interface UserContextType {
  userId: string | null;
  role: "admin" | "concierge" | null;
  hotelIds: string[];
  isAdmin: boolean;
  isConcierge: boolean;
  loading: boolean;
}
```

Usage : Authentification et autorisation globale pour admin/concierge.

### TimezoneContext (`src/contexts/TimezoneContext.tsx`)

```typescript
interface TimezoneContextType {
  userTimezone: string;          // Persisté en DB (profil)
  activeTimezone: string;        // Avec override temporaire
  setActiveTimezone: (tz: string) => void;
  resetToUserTimezone: () => void;
  saveUserTimezone: (tz: string) => Promise<void>;
  isTemporaryTimezone: boolean;
}
```

Usage : Gestion des fuseaux horaires (default: Europe/Paris).

### CartContext (`src/pages/client/context/CartContext.tsx`)

```typescript
interface BasketItem {
  id: string;
  name: string;
  price: number;
  currency?: string;
  duration: number;
  quantity: number;
  note?: string;
  image?: string;
  category: string;
  isPriceOnRequest?: boolean;
}
```

Usage : Panier client, persisté en sessionStorage par hotelId.

### FlowContext (`src/pages/client/context/FlowContext.tsx`)

```typescript
interface BookingDateTime { date: string; time: string; }
interface ClientInfo {
  firstName, lastName, phone, countryCode, email, roomNumber, note
}
```

Usage : État du parcours de réservation client (en mémoire uniquement).

### AnalyticsContext (`src/pages/client/context/AnalyticsContext.tsx`)

Usage : Tracking funnel client (page_view, action, conversion).

**Provider nesting** : `QueryClientProvider` > `TimezoneProvider` > `UserProvider` > `TooltipProvider` > (client flow: `AnalyticsProvider` > `ClientFlowProvider` > `CartProvider`)

## Composants Principaux

### Layout

| Composant | Fichier | Rôle |
|-----------|---------|------|
| `AppSidebar` | `components/AppSidebar.tsx` | Navigation admin/concierge (sidebar desktop, hamburger mobile) |
| `PwaLayout` | `components/pwa/Layout.tsx` | Layout PWA thérapeute avec TabBar bottom |
| `TabBar` | `components/pwa/TabBar.tsx` | Navigation bottom PWA thérapeute |
| `AdminPwaLayout` | `components/admin-pwa/Layout.tsx` | Layout PWA admin mobile |
| `ClientFlowWrapper` | `components/ClientFlowWrapper.tsx` | Session guest isolée (client booking) |

### Dialogs Admin

| Composant | Rôle |
|-----------|------|
| `CreateBookingDialog` | Créer réservation |
| `EditBookingDialog` | Modifier réservation |
| `BookingDetailDialog` | Voir détails réservation |
| `AddHairDresserDialog` | Ajouter thérapeute _(nom legacy)_ |
| `VenueWizardDialog` | Assistant création lieu (hôtel/spa) |
| `AddTreatmentMenuDialog` | Ajouter soin au catalogue |
| `TreatmentRequestDetailDialog` | Détail demande de devis |
| `SendPaymentLinkDialog` | Envoyer lien de paiement |
| `InvoicePreviewDialog` | Aperçu facture |

### Client Flow

| Composant | Rôle |
|-----------|------|
| `PractitionerCarousel` | Carrousel sélection thérapeute _(nom legacy)_ |
| `TimePeriodSelector` | Sélection créneau horaire |
| `ProgressBar` | Progression du flow de réservation |
| `CartDrawer` | Tiroir panier |
| `OnRequestFormDrawer` | Formulaire devis (prix sur demande) |
| `VideoDialog` | Aperçu vidéo soin |
| `PageTransition` | Transitions animées entre étapes |

### PWA Thérapeute

| Composant | Rôle |
|-----------|------|
| `PwaCalendarView` | Vue calendrier des RDV |
| `PaymentSelectionDrawer` | Sélection mode paiement |
| Wizard `new-booking/` | Création RDV multi-étapes (ClientInfo → Treatment → Summary → Success) |

## Hooks Personnalisés

| Hook | Fichier | Rôle |
|------|---------|------|
| `useVenueTerms` | `hooks/useVenueTerms.ts` | Terminologie adaptée par type de lieu (hotel/spa) |
| `useOneSignal` | `hooks/useOneSignal.ts` | Push notifications (OneSignal) |
| `useClientSession` | `hooks/useClientSession.ts` | Session guest isolée client |
| `useClientPrefetch` | `hooks/useClientPrefetch.ts` | Prefetch données étape suivante |
| `useRoleRedirect` | `hooks/useRoleRedirect.ts` | Redirection par rôle |
| `useDialogState` | `hooks/useDialogState.ts` | État ouverture/fermeture dialog |
| `useFileUpload` | `hooks/useFileUpload.ts` | Upload fichiers |
| `useTableSort` | `hooks/useTableSort.ts` | Tri tables admin |
| `usePagination` | `hooks/usePagination.ts` | Pagination tables admin |
| `useVenueDefaultLanguage` | `hooks/useVenueDefaultLanguage.ts` | Langue par défaut selon le lieu |
| `use-mobile` | `hooks/use-mobile.tsx` | Détection mobile (breakpoint) |

Hooks booking (`src/hooks/booking/`) : `useBookingCart`, `useBookingData`, `useBookingFilters`, `useBookingSelection`, `useCalendarLogic`, `useCreateBookingMutation`.

## Patterns Architecturaux

### Code Splitting

Toutes les pages sont lazy-loaded :

```typescript
const Dashboard = lazy(() => import("@/pages/admin/Dashboard"));
```

### Protection des Routes

```typescript
<AdminProtectedRoute>          // Vérifie role admin/concierge
<HairdresserProtectedRoute>    // Vérifie role therapist (legacy: hairdresser)
```

### Session Client Isolée

`ClientFlowWrapper` maintient une session guest séparée sans interférer avec l'auth Supabase des staff. Ceci permet à un appareil partagé (ex: tablette d'accueil spa) de servir à la fois les clients et le staff.

### Data Fetching

TanStack Query avec :

- 30s staleTime, 5min gcTime
- Pas de refetch automatique au focus fenêtre
- Prefetching sur navigation client

## Renommages de Routes à Prévoir

| Route actuelle | Route cible | Raison |
|----------------|-------------|--------|
| `/admin/hairdressers` | `/admin/therapists` | Terminologie Lymfea |
| `/admin/trunks` | `/admin/rooms` | Salles de soin au lieu de malles |
| `/rate/:token` | Inchangé | URL publique, token-based |
| `/enterprise/:hotelId` | À évaluer | Enterprise supprimé de venue_type |
