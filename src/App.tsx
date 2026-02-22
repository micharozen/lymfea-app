import { Suspense, lazy, useCallback, useEffect, useLayoutEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useOneSignal } from "@/hooks/useOneSignal";
import { TimezoneProvider } from "@/contexts/TimezoneContext";
import { UserProvider } from "@/contexts/UserContext";
import { brand } from "@/config/brand";

import AdminProtectedRoute from "./components/AdminProtectedRoute";
import TherapistProtectedRoute from "./components/TherapistProtectedRoute";
import { CartProvider } from "./pages/client/context/CartContext";
import { ClientFlowWrapper } from "./components/ClientFlowWrapper";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ClientErrorFallback } from "./components/client/ClientErrorFallback";

// Lazy load all page components for code splitting

// PWA Layout Component
const PwaLayout = lazy(() => import("./components/pwa/Layout"));

// Admin Pages
const Dashboard = lazy(() => import("./pages/admin/Dashboard"));
const Bookings = lazy(() => import("./pages/admin/Bookings"));
const Therapists = lazy(() => import("./pages/admin/Therapists"));
const AdminHotels = lazy(() => import("./pages/admin/Hotels"));
const VenueDetail = lazy(() => import("./pages/admin/VenueDetail"));
const AdminTreatments = lazy(() => import("./pages/admin/Treatments"));
const TreatmentRooms = lazy(() => import("./pages/admin/TreatmentRooms"));
const Concierges = lazy(() => import("./pages/admin/Concierges"));
const Products = lazy(() => import("./pages/admin/Products"));
const Orders = lazy(() => import("./pages/admin/Orders"));
const Finance = lazy(() => import("./pages/admin/Finance"));
const Transactions = lazy(() => import("./pages/admin/Transactions"));
const Analytics = lazy(() => import("./pages/admin/Analytics"));
const Settings = lazy(() => import("./pages/admin/Settings"));
const AdminProfile = lazy(() => import("./pages/admin/Profile"));

// Auth Pages
const Login = lazy(() => import("./pages/auth/Login"));
const SetPassword = lazy(() => import("./pages/auth/SetPassword"));
const UpdatePassword = lazy(() => import("./pages/auth/UpdatePassword"));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword"));

// Shared Pages
const NotFound = lazy(() => import("./pages/NotFound"));
const Home = lazy(() => import("./pages/Home"));
const RateTherapist = lazy(() => import("./pages/RateTherapist"));
const QuoteResponse = lazy(() => import("./pages/QuoteResponse"));
const PaymentConfirmation = lazy(() => import("./pages/PaymentConfirmation"));

// PWA Pages
const PwaLogin = lazy(() => import("./pages/pwa/Login"));
const PwaDashboard = lazy(() => import("./pages/pwa/Dashboard"));
const PwaBookings = lazy(() => import("./pages/pwa/Bookings"));
const PwaBookingDetail = lazy(() => import("./pages/pwa/BookingDetail"));
const PwaProfile = lazy(() => import("./pages/pwa/Profile"));
const PwaAccountSecurity = lazy(() => import("./pages/pwa/AccountSecurity"));
const PwaHotels = lazy(() => import("./pages/pwa/Hotels"));
const PwaSplash = lazy(() => import("./pages/pwa/Splash"));
const PwaWelcome = lazy(() => import("./pages/pwa/Welcome"));
const PwaOnboarding = lazy(() => import("./pages/pwa/Onboarding"));
const PwaNotifications = lazy(() => import("./pages/pwa/Notifications"));
const PwaInstall = lazy(() => import("./pages/pwa/Install"));
const PwaTestNotifications = lazy(() => import("./pages/pwa/TestNotifications"));
const PwaWallet = lazy(() => import("./pages/pwa/Wallet"));
const PwaStripeCallback = lazy(() => import("./pages/pwa/StripeCallback"));
const PwaNewBooking = lazy(() => import("./pages/pwa/NewBooking"));

// Admin PWA Layout & Pages
const AdminPwaLayout = lazy(() => import("./components/admin-pwa/Layout"));
const AdminPwaDashboard = lazy(() => import("./pages/admin-pwa/Dashboard"));
const AdminPwaBookingDetail = lazy(() => import("./pages/admin-pwa/BookingDetail"));
const AdminPwaCreateBooking = lazy(() => import("./pages/admin-pwa/CreateBooking"));
const AdminPwaNotifications = lazy(() => import("./pages/admin-pwa/Notifications"));
const AdminPwaAccueil = lazy(() => import("./pages/admin-pwa/Accueil"));
const AdminPwaInstall = lazy(() => import("./pages/admin-pwa/Install"));

// Client Pages
const Welcome = lazy(() => import("./pages/client/Welcome"));
const ClientTreatments = lazy(() => import("./pages/client/Treatments"));
const Cart = lazy(() => import("./pages/client/Cart"));
const Checkout = lazy(() => import("./pages/client/Checkout"));
const Schedule = lazy(() => import("./pages/client/Schedule"));
const GuestInfo = lazy(() => import("./pages/client/GuestInfo"));
const Payment = lazy(() => import("./pages/client/Payment"));
const Confirmation = lazy(() => import("./pages/client/Confirmation"));
const ManageBooking = lazy(() => import("./pages/client/ManageBooking"));

// Enterprise Dashboard
const EnterpriseDashboard = lazy(() => import("./pages/enterprise/EnterpriseDashboard"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

// Loading fallback component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
);

// Client-specific loader
const ClientPageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-white">
    <img
      src={brand.logos.emailLogoWhite}
      alt={brand.name}
      className="h-16 animate-pulse"
    />
  </div>
);

const App = () => {
  // Initialize OneSignal for push notifications
  useOneSignal();

  // Force iOS PWA to apply viewport-fit=cover even if index.html is cached
  useLayoutEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
    const content =
      "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover";

    if (meta) {
      meta.setAttribute("content", content);
    } else {
      meta = document.createElement("meta");
      meta.name = "viewport";
      meta.content = content;
      document.head.appendChild(meta);
    }
  }, []);

  const updateSafeAreaInsets = useCallback(() => {
    // iOS can report a gigantic safe-area-inset-bottom after certain navigations.
    // Measure it from computed styles, then clamp it to a sane value.
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.visibility = "hidden";
    el.style.pointerEvents = "none";
    el.style.paddingBottom = "env(safe-area-inset-bottom)";
    document.body.appendChild(el);

    const pb = parseFloat(window.getComputedStyle(el).paddingBottom || "0") || 0;
    document.body.removeChild(el);

    const clamped = Math.min(Math.max(pb, 0), 40);
    document.documentElement.style.setProperty("--app-safe-bottom", `${clamped}px`);
  }, []);

  // Global safe-area refresh (applies to PWA + admin + client flows)
  useEffect(() => {
    updateSafeAreaInsets();
    const raf = requestAnimationFrame(updateSafeAreaInsets);
    const t = window.setTimeout(updateSafeAreaInsets, 250);

    const vv = window.visualViewport;
    vv?.addEventListener("resize", updateSafeAreaInsets);
    vv?.addEventListener("scroll", updateSafeAreaInsets);
    window.addEventListener("resize", updateSafeAreaInsets);
    window.addEventListener("orientationchange", updateSafeAreaInsets);
    window.addEventListener("pageshow", updateSafeAreaInsets);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      vv?.removeEventListener("resize", updateSafeAreaInsets);
      vv?.removeEventListener("scroll", updateSafeAreaInsets);
      window.removeEventListener("resize", updateSafeAreaInsets);
      window.removeEventListener("orientationchange", updateSafeAreaInsets);
      window.removeEventListener("pageshow", updateSafeAreaInsets);
    };
  }, [updateSafeAreaInsets]);

  return (
    <QueryClientProvider client={queryClient}>
      <TimezoneProvider>
      <UserProvider>
        <TooltipProvider>
        <Sonner />
        <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Root - Smart redirect based on user type */}
            <Route path="/" element={<Home />} />
            
            {/* Enterprise Dashboard (Public - QR Code) */}
            <Route path="/enterprise/:hotelId" element={<EnterpriseDashboard />} />

            {/* Client Routes (QR Code - Public Access with Isolated Session) */}
            <Route path="/client/:hotelId/*" element={
              <ErrorBoundary fallback={(error, reset) => <ClientErrorFallback error={error} reset={reset} />}>
                <Suspense fallback={<ClientPageLoader />}>
                  <ClientFlowWrapper>
                    <CartProvider hotelId={window.location.pathname.split('/')[2]}>
                      <Routes>
                        <Route index element={<Welcome />} />
                        <Route path="/treatments" element={<ClientTreatments />} />
                        <Route path="/schedule" element={<Schedule />} />
                        <Route path="/guest-info" element={<GuestInfo />} />
                        <Route path="/payment" element={<Payment />} />
                        <Route path="/checkout" element={<Checkout />} />
                        <Route path="/confirmation/:bookingId?" element={<Confirmation />} />
                      </Routes>
                    </CartProvider>
                  </ClientFlowWrapper>
                </Suspense>
              </ErrorBoundary>
            } />

            {/* Client Booking Management (Public) */}
            <Route path="/booking/manage/:bookingId" element={<ManageBooking />} />

            {/* Payment Link Confirmation (Public) */}
            <Route path="/booking/confirmation/:bookingId" element={<PaymentConfirmation />} />

            {/* Rating Page (Public) */}
            <Route path="/rate/:token" element={<RateTherapist />} />
            
            {/* Quote Response Page (Public) */}
            <Route path="/quote-response" element={<QuoteResponse />} />
            
            {/* Auth Routes */}
            <Route path="/auth" element={<Login />} />
            <Route path="/login" element={<Login />} />
            <Route path="/set-password" element={<SetPassword />} />
            <Route path="/update-password" element={<UpdatePassword />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            
            {/* Legacy route redirects to admin routes */}
            <Route path="/booking" element={<Navigate to="/admin/bookings" replace />} />
            <Route path="/dashboard" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/hair-dresser" element={<Navigate to="/admin/therapists" replace />} />
            <Route path="/hotels" element={<Navigate to="/admin/places" replace />} />
            <Route path="/admin/hotels" element={<Navigate to="/admin/places" replace />} />
            <Route path="/treatment-menus" element={<Navigate to="/admin/treatments" replace />} />
            <Route path="/boxes" element={<Navigate to="/admin/treatment-rooms" replace />} />
            <Route path="/concierges" element={<Navigate to="/admin/concierges" replace />} />
            <Route path="/oom-products" element={<Navigate to="/admin/products" replace />} />
            <Route path="/oom-orders" element={<Navigate to="/admin/orders" replace />} />
            <Route path="/settings" element={<Navigate to="/admin/settings" replace />} />
            <Route path="/profile" element={<Navigate to="/admin/profile" replace />} />
            <Route path="/finance" element={<Navigate to="/admin/finance" replace />} />
            
            {/* PWA Public Routes (no TabBar, no auth) */}
            <Route path="/pwa/splash" element={<PwaSplash />} />
            <Route path="/pwa/welcome" element={<PwaWelcome />} />
            <Route path="/pwa/install" element={<PwaInstall />} />
            <Route path="/pwa/login" element={<PwaLogin />} />
            <Route path="/pwa/test-notifications" element={<PwaTestNotifications />} />
            <Route
              path="/pwa/onboarding"
              element={
                <TherapistProtectedRoute>
                  <PwaOnboarding />
                </TherapistProtectedRoute>
              }
            />
            <Route
              path="/pwa/stripe-callback"
              element={
                <TherapistProtectedRoute>
                  <PwaStripeCallback />
                </TherapistProtectedRoute>
              }
            />
            {/* PWA routes with TabBar */}
            <Route
              path="/pwa"
              element={
                <TherapistProtectedRoute>
                  <PwaLayout />
                </TherapistProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/pwa/dashboard" replace />} />
              <Route path="dashboard" element={<PwaDashboard />} />
              <Route path="bookings" element={<PwaBookings />} />
              <Route path="booking/:id" element={<PwaBookingDetail />} />
              <Route path="notifications" element={<PwaNotifications />} />
              <Route path="hotels" element={<PwaHotels />} />
              <Route path="wallet" element={<PwaWallet />} />
              <Route path="new-booking" element={<PwaNewBooking />} />
            </Route>
            {/* PWA routes without TabBar (still protected) */}
            <Route
              path="/pwa/profile"
              element={
                <TherapistProtectedRoute>
                  <PwaProfile />
                </TherapistProtectedRoute>
              }
            />
            <Route
              path="/pwa/profile/notifications"
              element={
                <TherapistProtectedRoute>
                  <PwaNotifications standalone />
                </TherapistProtectedRoute>
              }
            />
            <Route
              path="/pwa/profile/hotels"
              element={
                <TherapistProtectedRoute>
                  <PwaHotels standalone />
                </TherapistProtectedRoute>
              }
            />
            <Route
              path="/pwa/account-security"
              element={
                <TherapistProtectedRoute>
                  <PwaAccountSecurity />
                </TherapistProtectedRoute>
              }
            />
            
            {/* Admin PWA Public Routes */}
            <Route path="/admin-pwa/install" element={<AdminPwaInstall />} />

            {/* Admin PWA Routes with TabBar */}
            <Route
              path="/admin-pwa"
              element={
                <AdminProtectedRoute>
                  <AdminPwaLayout />
                </AdminProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/admin-pwa/accueil" replace />} />
              <Route path="accueil" element={<AdminPwaAccueil />} />
              <Route path="dashboard" element={<AdminPwaDashboard />} />
              <Route path="booking/:id" element={<AdminPwaBookingDetail />} />
              <Route path="create" element={<AdminPwaCreateBooking />} />
              <Route path="notifications" element={<AdminPwaNotifications />} />
            </Route>

            {/* Admin Dashboard Routes */}
            <Route
              path="/admin/*"
              element={
                <AdminProtectedRoute>
                  {(window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true)
                    ? <Navigate to="/admin-pwa/accueil" replace />
                    : (
                  <SidebarProvider>
                    <div className="flex min-h-screen w-full">
                      <AppSidebar />
                      <div className="flex-1 flex flex-col">
                        {/* Mobile header with menu trigger */}
                        <header className="md:hidden flex items-center h-14 px-4 border-b border-border bg-background sticky top-0 z-40" style={{ paddingTop: "env(safe-area-inset-top)" }}>
                          <SidebarTrigger className="mr-2" />
                          <span className="font-semibold">{brand.pwa.admin.shortName}</span>
                        </header>
                        <main className="flex-1">
                          <Suspense fallback={
                            <div className="flex items-center justify-center h-full min-h-[50vh]">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                            </div>
                          }>
                            <Routes>
                              <Route path="/" element={<Dashboard />} />
                              <Route path="/dashboard" element={<Dashboard />} />
                              <Route path="/bookings" element={<Bookings />} />
                              <Route path="/therapists" element={<Therapists />} />
                              <Route path="/places" element={<AdminHotels />} />
                              <Route path="/places/new" element={<VenueDetail />} />
                              <Route path="/places/:id" element={<VenueDetail />} />
                              <Route path="/treatments" element={<AdminTreatments />} />
                              <Route path="/treatment-rooms" element={<TreatmentRooms />} />
                              <Route path="/concierges" element={<Concierges />} />
                              <Route path="/products" element={<Products />} />
                              <Route path="/orders" element={<Orders />} />
                              <Route path="/finance" element={<Finance />} />
                              <Route path="/transactions" element={<Transactions />} />
                              <Route path="/analytics" element={<Analytics />} />
                              <Route path="/settings" element={<Settings />} />
                              <Route path="/profile" element={<AdminProfile />} />
                              <Route path="*" element={<NotFound />} />
                            </Routes>
                          </Suspense>
                        </main>
                      </div>
                    </div>
                  </SidebarProvider>
                    )}
                </AdminProtectedRoute>
              }
            />
          </Routes>
        </Suspense>
      </BrowserRouter>
      </TooltipProvider>
      </UserProvider>
    </TimezoneProvider>
  </QueryClientProvider>
  );
};

export default App;
