# OOM Hotel - Frontend Architecture

## Structure des Routes

### Admin Dashboard (`/admin/*`)

| Route | Page | Protection |
|-------|------|------------|
| `/admin/dashboard` | Dashboard analytics | AdminProtectedRoute |
| `/admin/bookings` | Gestion réservations | AdminProtectedRoute |
| `/admin/hairdressers` | Gestion coiffeurs | AdminProtectedRoute |
| `/admin/hotels` | Gestion hôtels | AdminProtectedRoute |
| `/admin/treatments` | Menu des soins | AdminProtectedRoute |
| `/admin/trunks` | Équipements | AdminProtectedRoute |
| `/admin/concierges` | Gestion concierges | AdminProtectedRoute |
| `/admin/products` | Produits OOM | AdminProtectedRoute |
| `/admin/orders` | Commandes | AdminProtectedRoute |
| `/admin/finance` | Dashboard financier | AdminProtectedRoute |
| `/admin/transactions` | Historique transactions | AdminProtectedRoute |
| `/admin/settings` | Paramètres | AdminProtectedRoute |
| `/admin/profile` | Profil admin | AdminProtectedRoute |

### PWA Hairdresser (`/pwa/*`)

| Route | Page | Protection |
|-------|------|------------|
| `/pwa/splash` | Splash screen | Public |
| `/pwa/welcome` | Accueil | Public |
| `/pwa/login` | Connexion | Public |
| `/pwa/onboarding` | Onboarding | Public |
| `/pwa/dashboard` | Home + bookings | HairdresserProtectedRoute |
| `/pwa/bookings` | Liste réservations | HairdresserProtectedRoute |
| `/pwa/booking/:id` | Détail réservation | HairdresserProtectedRoute |
| `/pwa/notifications` | Notifications | HairdresserProtectedRoute |
| `/pwa/hotels` | Hôtels affiliés | HairdresserProtectedRoute |
| `/pwa/wallet` | Wallet/gains | HairdresserProtectedRoute |
| `/pwa/profile` | Profil | HairdresserProtectedRoute |
| `/pwa/account-security` | Sécurité | HairdresserProtectedRoute |

### Client Booking Flow (`/client/:hotelId/*`)

| Route | Page |
|-------|------|
| `/client/:hotelId` | Welcome page |
| `/client/:hotelId/treatments` | Sélection soins |
| `/client/:hotelId/schedule` | Date/heure/coiffeur |
| `/client/:hotelId/guest-info` | Infos client |
| `/client/:hotelId/payment` | Méthode paiement |
| `/client/:hotelId/checkout` | Récapitulatif |
| `/client/:hotelId/confirmation/:bookingId` | Confirmation |

### Routes Publiques

| Route | Page |
|-------|------|
| `/` | Redirect selon rôle |
| `/booking/manage/:bookingId` | Gérer réservation |
| `/rate/:token` | Noter coiffeur |
| `/quote-response` | Réponse devis |

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
Usage : Authentification et autorisation globale

### TimezoneContext (`src/contexts/TimezoneContext.tsx`)
```typescript
interface TimezoneContextType {
  userTimezone: string;
  activeTimezone: string;
  setActiveTimezone: (tz: string) => void;
  resetToUserTimezone: () => void;
  saveUserTimezone: (tz: string) => Promise<void>;
  isTemporaryTimezone: boolean;
}
```
Usage : Gestion des fuseaux horaires

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
Usage : Panier client, persisté en sessionStorage par hotelId

### FlowContext (`src/pages/client/context/FlowContext.tsx`)
```typescript
interface BookingDateTime { date: string; time: string; }
interface ClientInfo {
  firstName, lastName, phone, countryCode, email, roomNumber, note
}
```
Usage : État du parcours de réservation client

## Composants Principaux

### Layout

| Composant | Fichier | Rôle |
|-----------|---------|------|
| `AppSidebar` | `components/AppSidebar.tsx` | Navigation admin/concierge |
| `PwaLayout` | `components/pwa/Layout.tsx` | Layout PWA avec TabBar |
| `TabBar` | `components/pwa/TabBar.tsx` | Navigation bottom PWA |
| `ClientFlowWrapper` | `components/ClientFlowWrapper.tsx` | Session isolée client |

### Dialogs Admin

| Composant | Rôle |
|-----------|------|
| `CreateBookingDialog` | Créer réservation |
| `EditBookingDialog` | Modifier réservation |
| `BookingDetailDialog` | Voir détails |
| `AddHairDresserDialog` | Ajouter coiffeur |
| `VenueWizardDialog` | Assistant création hôtel |
| `AddTreatmentMenuDialog` | Ajouter soin |

### Client Flow

| Composant | Rôle |
|-----------|------|
| `PractitionerCarousel` | Carrousel coiffeurs |
| `TimePeriodSelector` | Sélection créneau |
| `ProgressBar` | Progression du flow |
| `VideoDialog` | Aperçu vidéo soin |

## Hooks Personnalisés

| Hook | Fichier | Rôle |
|------|---------|------|
| `useOneSignal` | `hooks/useOneSignal.ts` | Push notifications |
| `useClientSession` | `hooks/useClientSession.ts` | Session client booking |
| `useClientPrefetch` | `hooks/useClientPrefetch.ts` | Prefetch données |
| `useRoleRedirect` | `hooks/useRoleRedirect.ts` | Redirection par rôle |
| `useDialogState` | `hooks/useDialogState.ts` | État dialog |
| `useFileUpload` | `hooks/useFileUpload.ts` | Upload fichiers |
| `useTableSort` | `hooks/useTableSort.ts` | Tri tables |
| `usePagination` | `hooks/usePagination.ts` | Pagination |
| `useVenueTerms` | `hooks/useVenueTerms.ts` | Terminologie venue |
| `use-mobile` | `hooks/use-mobile.tsx` | Détection mobile |
| `use-toast` | `hooks/use-toast.ts` | Notifications toast |

## Patterns Architecturaux

### Code Splitting
Toutes les pages sont lazy-loaded :
```typescript
const Dashboard = lazy(() => import("@/pages/admin/Dashboard"));
```

### Protection des Routes
```typescript
<AdminProtectedRoute>     // Vérifie role admin
<HairdresserProtectedRoute>  // Vérifie role hairdresser
<ProtectedRoute>          // Auth générique
```

### Session Client Isolée
`ClientFlowWrapper` maintient une session guest séparée sans interférer avec l'auth Supabase des staff.

### Data Fetching
TanStack Query avec :
- Cache automatique
- Refetch on focus
- Prefetching sur navigation
