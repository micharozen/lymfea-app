import { useLocation, useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
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
  { title: "Réservations", url: "/booking", emoji: "🗓️" },
  { title: "Coiffeurs", url: "/hair-dresser", emoji: "💇‍♂️" },
  { title: "Hôtels", url: "/hotels", emoji: "🏨" },
  { title: "Menus de soins", url: "/treatment-menus", emoji: "📓" },
  { title: "Box", url: "/boxes", emoji: "📦" },
  { title: "Concierges", url: "/concierges", emoji: "🛎️" },
  { title: "Produits OOM", url: "/oom-products", emoji: "💈" },
  { title: "Commandes", url: "/oom-orders", emoji: "🚚" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isCollapsed = state === "collapsed";
  const [adminInfo, setAdminInfo] = useState<{ firstName: string; lastName: string; profileImage: string | null } | null>(null);

  useEffect(() => {
    const fetchAdminInfo = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: admin } = await supabase
          .from('admins')
          .select('first_name, last_name, profile_image')
          .eq('user_id', user.id)
          .single();
        
        if (admin) {
          setAdminInfo({ 
            firstName: admin.first_name, 
            lastName: admin.last_name,
            profileImage: admin.profile_image 
          });
        }
      }
    };
    
    fetchAdminInfo();

    // Écouter les changements en temps réel
    const channel = supabase
      .channel('admin-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'admins',
        },
        () => {
          fetchAdminInfo();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Erreur",
        description: "Impossible de se déconnecter",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Déconnexion réussie",
        description: "À bientôt !",
      });
      navigate("/auth");
    }
  };

  return (
    <Sidebar className={isCollapsed ? "w-16" : "w-64"}>
      <SidebarContent className="flex flex-col h-full">
        {/* Profil utilisateur en haut avec dropdown */}
        <div className="px-3 py-4 border-b border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 w-full hover:bg-sidebar-accent/50 p-1 rounded-lg transition-colors">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-medium flex-shrink-0 overflow-hidden">
                  {adminInfo?.profileImage ? (
                    <img 
                      src={`${adminInfo.profileImage}?t=${Date.now()}`} 
                      alt="Profile" 
                      className="w-full h-full object-cover" 
                    />
                  ) : (
                    <span>{adminInfo ? `${adminInfo.firstName.charAt(0)}${adminInfo.lastName.charAt(0)}` : 'TU'}</span>
                  )}
                </div>
                {!isCollapsed && (
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-medium text-sidebar-foreground">
                        {adminInfo ? `${adminInfo.firstName} ${adminInfo.lastName}` : 'Tom Uzan'}
                      </p>
                      <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/40" />
                    </div>
                    <p className="text-xs text-sidebar-foreground/60">Admin</p>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem asChild className="cursor-pointer">
                <NavLink to="/profile" className="flex items-center w-full">
                  <User className="mr-2 h-4 w-4" />
                  <span>Profil</span>
                </NavLink>
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Déconnexion</span>
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
                        <span className="text-lg flex-shrink-0">{item.emoji}</span>
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
