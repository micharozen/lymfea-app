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
  User,
  LogOut,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const menuItems = [
  { title: "Accueil", url: "/", icon: Home },
  { title: "Paramètres & Accès", url: "/settings", icon: Settings },
];

const subMenuItems = [
  { title: "Réservations", url: "/booking", icon: Calendar, color: "text-blue-500" },
  { title: "Coiffeurs", url: "/hair-dresser", icon: Scissors, color: "text-orange-500" },
  { title: "Hôtels", url: "/hotels", icon: Building2, color: "text-pink-500" },
  { title: "Menus de soins", url: "/treatment-menus", icon: Sparkles, color: "text-purple-500" },
  { title: "Box", url: "/boxes", icon: Package, color: "text-amber-600" },
  { title: "Concierges", url: "/concierges", icon: Users, color: "text-yellow-600" },
  { title: "Produits OOM", url: "/oom-products", icon: ShoppingBag, color: "text-purple-400" },
  { title: "Commandes", url: "/oom-orders", icon: ShoppingCart, color: "text-orange-400" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar className={isCollapsed ? "w-16" : "w-64"}>
      <SidebarContent className="flex flex-col h-full">
        {/* Profil utilisateur en haut avec dropdown */}
        <div className="px-3 py-4 border-b border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 w-full hover:bg-sidebar-accent/50 p-1 rounded-lg transition-colors">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-medium flex-shrink-0">
                  TU
                </div>
                {!isCollapsed && (
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-medium text-sidebar-foreground">Tom Uzan</p>
                      <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/40" />
                    </div>
                    <p className="text-xs text-sidebar-foreground/60">Admin</p>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
                        <item.icon className={`h-5 w-5 flex-shrink-0 ${item.color}`} />
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
