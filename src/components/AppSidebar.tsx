import { useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import oomLogo from "@/assets/oom-logo.svg";
import {
  Home,
  Calendar,
  Scissors,
  Building2,
  Sparkles,
  Package,
  Users,
  ShoppingBag,
  ShoppingCart,
  Settings,
  ChevronDown,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const menuItems = [
  { title: "Accueil", url: "/", icon: Home },
  { title: "Paramètres & Accès", url: "/settings", icon: Settings },
];

const subMenuItems = [
  { title: "Réservations", url: "/booking", icon: Calendar },
  { title: "Coiffeurs", url: "/hair-dresser", icon: Scissors },
  { title: "Hôtels", url: "/hotels", icon: Building2 },
  { title: "Menus de soins", url: "/treatment-menus", icon: Sparkles },
  { title: "Box", url: "/boxes", icon: Package },
  { title: "Concierges", url: "/concierges", icon: Users },
  { title: "Produits OOM", url: "/oom-products", icon: ShoppingBag },
  { title: "Commandes", url: "/oom-orders", icon: ShoppingCart },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar className={isCollapsed ? "w-16" : "w-64"}>
      <SidebarContent className="flex flex-col h-full">
        {/* Profil utilisateur en haut */}
        <div className="px-3 py-4 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-medium flex-shrink-0">
              TU
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-medium text-sidebar-foreground">Tom Uzan</p>
                  <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/40" />
                </div>
                <p className="text-xs text-sidebar-foreground/60">Admin</p>
              </div>
            )}
          </div>
        </div>

        {/* Home et Paramètres */}
        <SidebarGroup className="py-2">
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        }`}
                      >
                        <item.icon className="h-5 w-5 flex-shrink-0" />
                        {!isCollapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Séparateur et Menu */}
        <div className="border-t border-sidebar-border" />
        
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 px-3 py-2">
            {!isCollapsed && "Menu"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {subMenuItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        }`}
                      >
                        <item.icon className="h-5 w-5 flex-shrink-0" />
                        {!isCollapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Logo en bas */}
        <div className="mt-auto border-t border-sidebar-border">
          <div className="flex items-center justify-center p-4">
            {!isCollapsed && (
              <img src={oomLogo} alt="OOM" className="h-10 w-auto" />
            )}
            {isCollapsed && (
              <img src={oomLogo} alt="OOM" className="h-6 w-auto" />
            )}
          </div>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
