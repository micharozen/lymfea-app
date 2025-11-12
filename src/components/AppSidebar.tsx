import { useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
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
  { title: "Tableau de bord", url: "/", icon: Home },
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
      <SidebarContent>
        <div className="flex items-center justify-center p-6 border-b border-sidebar-border">
          {!isCollapsed && (
            <h1 className="text-2xl font-bold text-sidebar-foreground">OOM Panel</h1>
          )}
          {isCollapsed && (
            <span className="text-2xl font-bold text-sidebar-foreground">O</span>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/70">
            {!isCollapsed && "Navigation"}
          </SidebarGroupLabel>
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
      </SidebarContent>
    </Sidebar>
  );
}
