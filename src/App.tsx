import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import AdminProtectedRoute from "./components/AdminProtectedRoute";
import HairdresserProtectedRoute from "./components/HairdresserProtectedRoute";
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
import PwaSplash from "./pages/pwa/PwaSplash";
import PwaWelcome from "./pages/pwa/PwaWelcome";
import PwaOnboarding from "./pages/pwa/PwaOnboarding";
import PwaNotifications from "./pages/pwa/PwaNotifications";
import Landing from "./pages/Landing";

const queryClient = new QueryClient();
const App = () => <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public Landing Page */}
          <Route path="/landing" element={<Landing />} />
          
          {/* Admin Auth Routes */}
          <Route path="/auth" element={<Auth />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/set-password" element={<SetPassword />} />
          
          {/* PWA Routes */}
          <Route path="/pwa" element={<PwaSplash />} />
          <Route path="/pwa/welcome" element={<PwaWelcome />} />
          <Route path="/pwa/login" element={<PwaLogin />} />
          <Route
            path="/pwa/onboarding"
            element={
              <HairdresserProtectedRoute>
                <PwaOnboarding />
              </HairdresserProtectedRoute>
            }
          />
          <Route
            path="/pwa/*"
            element={
              <HairdresserProtectedRoute>
                <Routes>
                  <Route path="/dashboard" element={<PwaDashboard />} />
                  <Route path="/bookings" element={<PwaBookings />} />
                  <Route path="/booking/:id" element={<PwaBookingDetail />} />
                  <Route path="/notifications" element={<PwaNotifications />} />
                  <Route path="/profile" element={<PwaProfile />} />
                  <Route path="*" element={<Navigate to="/pwa/dashboard" replace />} />
                </Routes>
              </HairdresserProtectedRoute>
            }
          />
          
          {/* Admin Dashboard Routes */}
          <Route
            path="/*"
            element={
              <AdminProtectedRoute>
                <SidebarProvider>
                  <div className="flex min-h-screen w-full">
                    <AppSidebar />
                    <div className="flex-1 flex flex-col">
                      <main className="flex-1">
                        <Routes>
                          <Route path="/" element={<Dashboard />} />
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
  </QueryClientProvider>;
export default App;