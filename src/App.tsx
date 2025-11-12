import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
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
import NotFound from "./pages/NotFound";
const queryClient = new QueryClient();
const App = () => <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
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
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>;
export default App;