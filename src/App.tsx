import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useOneSignal } from "@/hooks/useOneSignal";

import AdminProtectedRoute from "./components/AdminProtectedRoute";
import HairdresserProtectedRoute from "./components/HairdresserProtectedRoute";
import PwaLayout from "./components/pwa/PwaLayout";
import Dashboard from "./pages/Dashboard";
import Booking from "./pages/Booking";
import HairDresser from "./pages/HairDresser";
import Hotels from "./pages/Hotels";
import TreatmentMenus from "./pages/TreatmentMenus";
import Boxes from "./pages/Boxes";
import Concierges from "./pages/Concierges";
import OomProducts from "./pages/OomProducts";
import OomOrders from "./pages/OomOrders";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import Auth from "./pages/Auth";
import SetPassword from "./pages/SetPassword";
import NotFound from "./pages/NotFound";
import PwaLogin from "./pages/pwa/PwaLogin";
import PwaDashboard from "./pages/pwa/PwaDashboard";
import PwaBookings from "./pages/pwa/PwaBookings";
import PwaBookingDetail from "./pages/pwa/PwaBookingDetail";
import PwaProfile from "./pages/pwa/PwaProfile";
import PwaAccountSecurity from "./pages/pwa/PwaAccountSecurity";
import PwaHotels from "./pages/pwa/PwaHotels";
import PwaSplash from "./pages/pwa/PwaSplash";
import PwaWelcome from "./pages/pwa/PwaWelcome";
import PwaOnboarding from "./pages/pwa/PwaOnboarding";
import PwaNotifications from "./pages/pwa/PwaNotifications";
import PwaInstall from "./pages/pwa/PwaInstall";
import PwaTestNotifications from "./pages/pwa/PwaTestNotifications";
import PwaWallet from "./pages/pwa/PwaWallet";

import Home from "./pages/Home";
import ClientWelcome from "./pages/client/ClientWelcome";
import ClientMenu from "./pages/client/ClientMenu";
import ClientBasket from "./pages/client/ClientBasket";
import ClientCheckout from "./pages/client/ClientCheckout";
import ClientDateTime from "./pages/client/ClientDateTime";
import ClientInfo from "./pages/client/ClientInfo";
import ClientPayment from "./pages/client/ClientPayment";
import ClientConfirmation from "./pages/client/ClientConfirmation";
import { BasketProvider } from "./pages/client/context/BasketContext";
import RateHairdresser from "./pages/RateHairdresser";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});


const App = () => {
  // Initialize OneSignal for push notifications
  useOneSignal();

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Root - Smart redirect based on user type */}
          <Route path="/" element={<Home />} />
          
          {/* Client Routes (QR Code - Public Access) */}
          <Route path="/client/:hotelId" element={<ClientWelcome />} />
          <Route path="/client/:hotelId/*" element={
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
          } />
          
          {/* Rating Page (Public) */}
          <Route path="/rate/:token" element={<RateHairdresser />} />
          
          {/* Admin Auth Routes */}
          <Route path="/auth" element={<Auth />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/set-password" element={<SetPassword />} />
          
          {/* Legacy route redirects to admin routes */}
          <Route path="/booking" element={<Navigate to="/admin/booking" replace />} />
          <Route path="/dashboard" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/hair-dresser" element={<Navigate to="/admin/hair-dresser" replace />} />
          <Route path="/hotels" element={<Navigate to="/admin/hotels" replace />} />
          <Route path="/treatment-menus" element={<Navigate to="/admin/treatment-menus" replace />} />
          <Route path="/boxes" element={<Navigate to="/admin/boxes" replace />} />
          <Route path="/concierges" element={<Navigate to="/admin/concierges" replace />} />
          <Route path="/oom-products" element={<Navigate to="/admin/oom-products" replace />} />
          <Route path="/oom-orders" element={<Navigate to="/admin/oom-orders" replace />} />
          <Route path="/settings" element={<Navigate to="/admin/settings" replace />} />
          <Route path="/profile" element={<Navigate to="/admin/profile" replace />} />
          
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
                          <Route path="/boxes" element={<Boxes />} />
                          <Route path="/concierges" element={<Concierges />} />
                          <Route path="/oom-products" element={<OomProducts />} />
                          <Route path="/oom-orders" element={<OomOrders />} />
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
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;