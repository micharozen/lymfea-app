import { Suspense, lazy, useCallback, useEffect, useLayoutEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useOneSignal } from "@/hooks/useOneSignal";
import { TimezoneProvider } from "@/contexts/TimezoneContext";
import { UserProvider } from "@/contexts/UserContext";

import AdminProtectedRoute from "./components/AdminProtectedRoute";
import HairdresserProtectedRoute from "./components/HairdresserProtectedRoute";
import { BasketProvider } from "./pages/client/context/BasketContext";
import { ClientFlowWrapper } from "./components/ClientFlowWrapper";

// Lazy load all page components for code splitting
const PwaLayout = lazy(() => import("./components/pwa/PwaLayout"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Booking = lazy(() => import("./pages/Booking"));
const HairDresser = lazy(() => import("./pages/HairDresser"));
const Hotels = lazy(() => import("./pages/Hotels"));
const TreatmentMenus = lazy(() => import("./pages/TreatmentMenus"));
const Trunks = lazy(() => import("./pages/Trunks"));
const Concierges = lazy(() => import("./pages/Concierges"));
const OomProducts = lazy(() => import("./pages/OomProducts"));
const OomOrders = lazy(() => import("./pages/OomOrders"));
const Finance = lazy(() => import("./pages/Finance"));
const ConciergeTransactions = lazy(() => import("./pages/ConciergeTransactions"));
const Settings = lazy(() => import("./pages/Settings"));
const Profile = lazy(() => import("./pages/Profile"));
const Auth = lazy(() => import("./pages/Auth"));
const SetPassword = lazy(() => import("./pages/SetPassword"));
const UpdatePassword = lazy(() => import("./pages/UpdatePassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PwaLogin = lazy(() => import("./pages/pwa/PwaLogin"));
const PwaDashboard = lazy(() => import("./pages/pwa/PwaDashboard"));
const PwaBookings = lazy(() => import("./pages/pwa/PwaBookings"));
const PwaBookingDetail = lazy(() => import("./pages/pwa/PwaBookingDetail"));
const PwaProfile = lazy(() => import("./pages/pwa/PwaProfile"));
const PwaAccountSecurity = lazy(() => import("./pages/pwa/PwaAccountSecurity"));
const PwaHotels = lazy(() => import("./pages/pwa/PwaHotels"));
const PwaSplash = lazy(() => import("./pages/pwa/PwaSplash"));
const PwaWelcome = lazy(() => import("./pages/pwa/PwaWelcome"));
const PwaOnboarding = lazy(() => import("./pages/pwa/PwaOnboarding"));
const PwaNotifications = lazy(() => import("./pages/pwa/PwaNotifications"));
const PwaInstall = lazy(() => import("./pages/pwa/PwaInstall"));
const PwaTestNotifications = lazy(() => import("./pages/pwa/PwaTestNotifications"));
const PwaWallet = lazy(() => import("./pages/pwa/PwaWallet"));
const PwaStripeCallback = lazy(() => import("./pages/pwa/PwaStripeCallback"));

const Home = lazy(() => import("./pages/Home"));
const ClientWelcome = lazy(() => import("./pages/client/ClientWelcome"));
const ClientMenu = lazy(() => import("./pages/client/ClientMenu"));
const ClientBasket = lazy(() => import("./pages/client/ClientBasket"));
const ClientCheckout = lazy(() => import("./pages/client/ClientCheckout"));
const ClientDateTime = lazy(() => import("./pages/client/ClientDateTime"));
const ClientInfo = lazy(() => import("./pages/client/ClientInfo"));
const ClientPayment = lazy(() => import("./pages/client/ClientPayment"));
const ClientConfirmation = lazy(() => import("./pages/client/ClientConfirmation"));
const ClientManageBooking = lazy(() => import("./pages/client/ClientManageBooking"));
const RateHairdresser = lazy(() => import("./pages/RateHairdresser"));
const QuoteResponse = lazy(() => import("./pages/QuoteResponse"));

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
    document.documentElement.style.setProperty("--oom-safe-bottom", `${clamped}px`);
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
            
            {/* Client Routes (QR Code - Public Access with Isolated Session) */}
            <Route path="/client/:hotelId" element={
              <ClientFlowWrapper>
                <ClientWelcome />
              </ClientFlowWrapper>
            } />
            <Route path="/client/:hotelId/*" element={
              <ClientFlowWrapper>
                <BasketProvider hotelId={window.location.pathname.split('/')[2]}>
                  <Routes>
                    <Route path="/menu" element={<ClientMenu />} />
                    <Route path="/basket" element={<ClientBasket />} />
                    <Route path="/datetime" element={<ClientDateTime />} />
                    <Route path="/info" element={<ClientInfo />} />
                    <Route path="/payment" element={<ClientPayment />} />
                    <Route path="/checkout" element={<ClientCheckout />} />
                    <Route path="/confirmation/:bookingId?" element={<ClientConfirmation />} />
                  </Routes>
                </BasketProvider>
              </ClientFlowWrapper>
            } />
            
            {/* Client Booking Management (Public) */}
            <Route path="/booking/manage/:bookingId" element={<ClientManageBooking />} />
            
            {/* Rating Page (Public) */}
            <Route path="/rate/:token" element={<RateHairdresser />} />
            
            {/* Quote Response Page (Public) */}
            <Route path="/quote-response" element={<QuoteResponse />} />
            
            {/* Admin Auth Routes */}
            <Route path="/auth" element={<Auth />} />
            <Route path="/login" element={<Auth />} />
            <Route path="/set-password" element={<SetPassword />} />
            <Route path="/update-password" element={<UpdatePassword />} />
            
            {/* Legacy route redirects to admin routes */}
            <Route path="/booking" element={<Navigate to="/admin/booking" replace />} />
            <Route path="/dashboard" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/hair-dresser" element={<Navigate to="/admin/hair-dresser" replace />} />
            <Route path="/hotels" element={<Navigate to="/admin/hotels" replace />} />
            <Route path="/treatment-menus" element={<Navigate to="/admin/treatment-menus" replace />} />
            <Route path="/boxes" element={<Navigate to="/admin/trunks" replace />} />
            <Route path="/concierges" element={<Navigate to="/admin/concierges" replace />} />
            <Route path="/oom-products" element={<Navigate to="/admin/oom-products" replace />} />
            <Route path="/oom-orders" element={<Navigate to="/admin/oom-orders" replace />} />
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
                <HairdresserProtectedRoute>
                  <PwaOnboarding />
                </HairdresserProtectedRoute>
              }
            />
            <Route
              path="/pwa/stripe-callback"
              element={
                <HairdresserProtectedRoute>
                  <PwaStripeCallback />
                </HairdresserProtectedRoute>
              }
            />
            {/* PWA routes with TabBar */}
            <Route
              path="/pwa"
              element={
                <HairdresserProtectedRoute>
                  <PwaLayout />
                </HairdresserProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/pwa/dashboard" replace />} />
              <Route path="dashboard" element={<PwaDashboard />} />
              <Route path="bookings" element={<PwaBookings />} />
              <Route path="booking/:id" element={<PwaBookingDetail />} />
              <Route path="notifications" element={<PwaNotifications />} />
              <Route path="hotels" element={<PwaHotels />} />
              <Route path="wallet" element={<PwaWallet />} />
            </Route>
            {/* PWA routes without TabBar (still protected) */}
            <Route
              path="/pwa/profile"
              element={
                <HairdresserProtectedRoute>
                  <PwaProfile />
                </HairdresserProtectedRoute>
              }
            />
            <Route
              path="/pwa/profile/notifications"
              element={
                <HairdresserProtectedRoute>
                  <PwaNotifications standalone />
                </HairdresserProtectedRoute>
              }
            />
            <Route
              path="/pwa/profile/hotels"
              element={
                <HairdresserProtectedRoute>
                  <PwaHotels standalone />
                </HairdresserProtectedRoute>
              }
            />
            <Route
              path="/pwa/account-security"
              element={
                <HairdresserProtectedRoute>
                  <PwaAccountSecurity />
                </HairdresserProtectedRoute>
              }
            />
            
            {/* Admin Dashboard Routes */}
            <Route
              path="/admin/*"
              element={
                <AdminProtectedRoute>
                  <SidebarProvider>
                    <div className="flex min-h-screen w-full">
                      <AppSidebar />
                      <div className="flex-1 flex flex-col">
                        <main className="flex-1">
                          <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/dashboard" element={<Dashboard />} />
                            <Route path="/booking" element={<Booking />} />
                            <Route path="/hair-dresser" element={<HairDresser />} />
                            <Route path="/hotels" element={<Hotels />} />
                            <Route path="/treatment-menus" element={<TreatmentMenus />} />
                            <Route path="/trunks" element={<Trunks />} />
                            <Route path="/concierges" element={<Concierges />} />
                            <Route path="/oom-products" element={<OomProducts />} />
                            <Route path="/oom-orders" element={<OomOrders />} />
                            <Route path="/finance" element={<Finance />} />
                            <Route path="/transactions" element={<ConciergeTransactions />} />
                            <Route path="/settings" element={<Settings />} />
                            <Route path="/profile" element={<Profile />} />
                            <Route path="*" element={<NotFound />} />
                          </Routes>
                        </main>
                      </div>
                    </div>
                  </SidebarProvider>
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
