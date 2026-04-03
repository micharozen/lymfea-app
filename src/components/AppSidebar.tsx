import { useLocation, useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { brand, brandLogos } from "@/config/brand";
import { GlobalSearch } from "@/components/admin/GlobalSearch";
import {
  Home,
  Calendar,
  Building2,
  Sparkles,
  Package,
  Users,
  ShoppingBag,
  ShoppingCart,
  Settings,
  ChevronDown,
  ChevronsLeft,
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

const adminMenuItems = [
  { title: "Accueil", url: "/admin", icon: Home },
  { title: "Paramètres & Accès", url: "/admin/settings", icon: Settings },
];

const conciergeMenuItems = [
  { title: "Accueil", url: "/admin", icon: Home },
];

const adminSubMenuItems = [
  { title: "Planning", url: "/admin/bookings", emoji: "🗓️" },
  { title: "Lieux", url: "/admin/places", emoji: "📍" },
  { title: "Thérapeutes", url: "/admin/therapists", emoji: "💆" },
  { title: "Alertes planning", url: "/admin/schedule-alerts", emoji: "🚩" },
  { title: "Menus de soins", url: "/admin/treatments", emoji: "📓" },
  { title: "Salles de soin", url: "/admin/treatment-rooms", emoji: "🚪" },
  { title: "Équipe lieu", url: "/admin/concierges", emoji: "👥" },
  { title: "Clients", url: "/admin/customers", emoji: "👤" },
  { title: `Produits ${brand.name}`, url: "/admin/products", emoji: "🧴" },
  { title: "Commandes", url: "/admin/orders", emoji: "🚚" },
  { title: "Finance", url: "/admin/finance", emoji: "💰" },
  { title: "Analytics", url: "/admin/analytics", emoji: "📊" },
];

const conciergeSubMenuItems = [
  { title: "Planning", url: "/admin/bookings", emoji: "🗓️" },
  { title: "Menus de soins", url: "/admin/treatments", emoji: "📓" },
  { title: "Transactions & Solde", url: "/admin/transactions", emoji: "💰" },
];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isCollapsed = state === "collapsed";
  const [adminInfo, setAdminInfo] = useState<{ firstName: string; lastName: string; profileImage: string | null } | null>(null);
  const [userRole, setUserRole] = useState<string>("...");
  const [redFlagCount, setRedFlagCount] = useState(0);

  useEffect(() => {
    const fetchAdminInfo = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Fetch user role
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (roleData) {
          const roleLabel = roleData.role === 'admin' ? 'Admin' : roleData.role === 'concierge' ? 'Équipe lieu' : roleData.role;
          setUserRole(roleLabel);
        }

        // Try admins first
        const { data: admin } = await supabase
          .from('admins')
          .select('first_name, last_name, profile_image')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (admin) {
          setAdminInfo({ 
            firstName: admin.first_name, 
            lastName: admin.last_name,
            profileImage: admin.profile_image 
          });
        } else {
          // Try concierges
          const { data: concierge } = await supabase
            .from('concierges')
            .select('id, first_name, last_name, profile_image, status')
            .eq('user_id', user.id)
            .maybeSingle();
          
          if (concierge) {
            console.log('[AppSidebar] Concierge trouvé:', {
              id: concierge.id,
              firstName: concierge.first_name,
              lastName: concierge.last_name,
              status: concierge.status
            });
            
            setAdminInfo({ 
              firstName: concierge.first_name, 
              lastName: concierge.last_name,
              profileImage: concierge.profile_image 
            });
            
            // Auto-activate concierge status on first login
            if (concierge.status === "En attente") {
              console.log('[AppSidebar] Tentative d\'activation du statut concierge...');
              const { data, error } = await supabase
                .from('concierges')
                .update({ status: "Actif" })
                .eq('id', concierge.id)
                .select();
              
              if (error) {
                console.error('[AppSidebar] Erreur lors de l\'activation:', error);
              } else {
                console.log('[AppSidebar] Statut activé avec succès:', data);
              }
            } else {
              console.log('[AppSidebar] Statut déjà actif, pas de mise à jour nécessaire');
            }
          }
        }
      }
    };
    
    fetchAdminInfo();

    // Écouter les changements en temps réel sur les deux tables
    const adminChannel = supabase
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

    const conciergeChannel = supabase
      .channel('concierge-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'concierges',
        },
        () => {
          fetchAdminInfo();
        }
      )
      .subscribe();

    // Red flag alert count
    const fetchRedFlagCount = async () => {
      const { count } = await supabase
        .from('audit_log')
        .select('*', { count: 'exact', head: true })
        .eq('table_name', 'therapist_availability')
        .eq('is_flagged', true)
        .is('acknowledged_at', null);
      setRedFlagCount(count || 0);
    };
    fetchRedFlagCount();

    const alertChannel = supabase
      .channel('audit-log-sidebar')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'audit_log',
        },
        () => {
          fetchRedFlagCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(adminChannel);
      supabase.removeChannel(conciergeChannel);
      supabase.removeChannel(alertChannel);
    };
  }, []);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    // Si session_not_found, la session est déjà invalide - on nettoie quand même
    if (error && !error.message?.includes("session_not_found") && error.status !== 403) {
      toast({
        title: "Erreur",
        description: "Impossible de se déconnecter",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Déconnexion réussie",
      description: "À bientôt !",
    });
    navigate("/auth");
  };

  return (
    <Sidebar collapsible="icon" expandOnHover>
      <SidebarContent className="flex flex-col h-full">
        {/* Profil utilisateur en haut avec dropdown */}
        <div className="px-3 py-4 border-b border-sidebar-border group-data-[collapsible=icon]:px-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 w-full hover:bg-sidebar-accent/50 p-1 rounded-lg transition-colors group-data-[collapsible=icon]:justify-center">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-medium flex-shrink-0 overflow-hidden">
                  {adminInfo?.profileImage ? (
                    <img 
                      src={`${adminInfo.profileImage}?t=${Date.now()}`} 
                      alt="Profile" 
                      className="w-full h-full object-cover" 
                    />
                  ) : adminInfo ? (
                    <span>{`${adminInfo.firstName.charAt(0)}${adminInfo.lastName.charAt(0)}`}</span>
                  ) : (
                    <span className="text-xs">...</span>
                  )}
                </div>
                <div className="flex-1 min-w-0 text-left group-data-[collapsible=icon]:hidden">
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-medium text-sidebar-foreground">
                      {adminInfo ? `${adminInfo.firstName} ${adminInfo.lastName}` : '...'}
                    </p>
                    <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/40" />
                  </div>
                  <p className="text-xs text-sidebar-foreground/60">{userRole}</p>
                </div>
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
{/* 2. AJOUT ICI : Barre de recherche globale */}
        <div className="mt-4 px-3 group-data-[collapsible=icon]:px-0">
          <GlobalSearch />
        </div>
        {/* Home et Paramètres */}
        <SidebarGroup className="py-2">
          <SidebarGroupContent>
            <SidebarMenu>
              {(userRole === 'Admin' ? adminMenuItems : conciergeMenuItems).map((item) => {
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
                        <span>{item.title}</span>
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
            Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {(userRole === 'Admin' ? adminSubMenuItems : conciergeSubMenuItems).map((item) => {
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
                        <span className="whitespace-nowrap">{item.title}</span>
                        {item.url === '/admin/schedule-alerts' && redFlagCount > 0 && (
                          <span className="ml-auto bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                            {redFlagCount > 99 ? '99+' : redFlagCount}
                          </span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Footer with logo and toggle */}
        <div className="mt-auto border-t border-sidebar-border">
          <div className="flex items-center justify-between p-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2">
            <img src={brandLogos.primary} alt={brand.name} className="h-8 w-auto group-data-[collapsible=icon]:hidden" />
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            >
              <ChevronsLeft className={`h-4 w-4 transition-transform duration-200 ${isCollapsed ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
