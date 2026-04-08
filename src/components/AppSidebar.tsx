import { useLocation, useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { brand, brandLogos } from "@/config/brand";
import { GlobalSearch } from "@/components/admin/GlobalSearch";
import {
  LayoutDashboard,
  CalendarDays,
  Building2,
  Users,
  BookOpen,
  DoorOpen,
  UserCog,
  Contact,
  Package,
  Truck,
  Wallet,
  BarChart3,
  Bell,
  Settings,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  User,
  LogOut,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MenuItem {
  title: string;
  url: string;
  icon: LucideIcon;
  badge?: boolean;
}

const adminPrimaryItems: MenuItem[] = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
  { title: "Planning", url: "/admin/bookings", icon: CalendarDays },
  { title: "Lieux", url: "/admin/places", icon: Building2 },
  { title: "Thérapeutes", url: "/admin/therapists", icon: Users },
  { title: "Menus de soins", url: "/admin/treatments", icon: BookOpen },
  { title: "Clients", url: "/admin/customers", icon: Contact },
  { title: "Alertes", url: "/admin/schedule-alerts", icon: Bell, badge: true },
];

const adminSecondaryItems: MenuItem[] = [
  { title: "Salles de soin", url: "/admin/treatment-rooms", icon: DoorOpen },
  { title: "Équipe lieu", url: "/admin/concierges", icon: UserCog },
  { title: `Produits`, url: "/admin/products", icon: Package },
  { title: "Commandes", url: "/admin/orders", icon: Truck },
  { title: "Finance", url: "/admin/finance", icon: Wallet },
  { title: "Analytics", url: "/admin/analytics", icon: BarChart3 },
];

const conciergePrimaryItems: MenuItem[] = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
  { title: "Planning", url: "/admin/bookings", icon: CalendarDays },
  { title: "Menus de soins", url: "/admin/treatments", icon: BookOpen },
  { title: "Transactions", url: "/admin/transactions", icon: Wallet },
];

const STORAGE_KEY = "lymfea-sidebar-more-open";

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isCollapsed = state === "collapsed";
  const [adminInfo, setAdminInfo] = useState<{ firstName: string; lastName: string; profileImage: string | null } | null>(null);
  const [userRole, setUserRole] = useState<string>("...");
  const [redFlagCount, setRedFlagCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) !== "false"; } catch { /* storage unavailable */ return true; }
  });

  const handleMoreToggle = (open: boolean) => {
    setMoreOpen(open);
    try { localStorage.setItem(STORAGE_KEY, String(open)); } catch { /* storage unavailable */ }
  };

  useEffect(() => {
    const fetchAdminInfo = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (roleData) {
          const roleLabel = roleData.role === 'admin' ? 'Admin' : roleData.role === 'concierge' ? 'Équipe lieu' : roleData.role;
          setUserRole(roleLabel);
        }

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
          const { data: concierge } = await supabase
            .from('concierges')
            .select('id, first_name, last_name, profile_image, status')
            .eq('user_id', user.id)
            .maybeSingle();
          
          if (concierge) {
            setAdminInfo({ 
              firstName: concierge.first_name, 
              lastName: concierge.last_name,
              profileImage: concierge.profile_image 
            });
            
            if (concierge.status === "En attente") {
              await supabase
                .from('concierges')
                .update({ status: "Actif" })
                .eq('id', concierge.id)
                .select();
            }
          }
        }
      }
    };
    
    fetchAdminInfo();

    const adminChannel = supabase
      .channel('admin-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'admins' }, () => fetchAdminInfo())
      .subscribe();

    const conciergeChannel = supabase
      .channel('concierge-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'concierges' }, () => fetchAdminInfo())
      .subscribe();

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_log' }, () => fetchRedFlagCount())
      .subscribe();

    return () => {
      supabase.removeChannel(adminChannel);
      supabase.removeChannel(conciergeChannel);
      supabase.removeChannel(alertChannel);
    };
  }, []);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error && !error.message?.includes("session_not_found") && error.status !== 403) {
      toast({ title: "Erreur", description: "Impossible de se déconnecter", variant: "destructive" });
      return;
    }
    toast({ title: "Déconnexion réussie", description: "À bientôt !" });
    navigate("/auth");
  };

  const isAdmin = userRole === 'Admin';
  const primaryItems = isAdmin ? adminPrimaryItems : conciergePrimaryItems;
  const secondaryItems = isAdmin ? adminSecondaryItems : [];

  const renderNavItem = (item: MenuItem) => {
    const isActive = location.pathname === item.url;
    return (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton asChild>
          <NavLink
            to={item.url}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            }`}
          >
            <item.icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={isActive ? 2 : 1.5} />
            <span className="text-[13px]">{item.title}</span>
            {item.badge && redFlagCount > 0 && (
              <span className="ml-auto bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {redFlagCount > 99 ? '99+' : redFlagCount}
              </span>
            )}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" expandOnHover>
      <SidebarContent className="flex flex-col h-full">
        {/* Logo */}
        <div className="px-4 py-4 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-3">
          <img
            src={brandLogos.primary}
            alt={brand.name}
            className="h-7 w-auto group-data-[collapsible=icon]:hidden"
          />
          <img
            src={brandLogos.monogram}
            alt={brand.name}
            className="h-7 w-auto hidden group-data-[collapsible=icon]:block mx-auto"
          />
        </div>

        {/* Search */}
        <div className="px-3 pb-2 group-data-[collapsible=icon]:px-0">
          <GlobalSearch />
        </div>

        {/* Primary navigation */}
        <SidebarGroup className="py-1">
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryItems.map(renderNavItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Secondary navigation (collapsible "More") -- admin only */}
        {secondaryItems.length > 0 && (
          <Collapsible open={moreOpen} onOpenChange={handleMoreToggle}>
            <div className="mx-3 border-t border-sidebar-border" />
            <SidebarGroup className="py-1">
              <CollapsibleTrigger className="flex items-center gap-2 px-3 py-2 w-full text-[11px] font-medium tracking-wide uppercase text-sidebar-foreground/40 hover:text-sidebar-foreground/60 transition-colors group-data-[collapsible=icon]:hidden">
                <ChevronRight className={`h-3 w-3 transition-transform duration-200 ${moreOpen ? "rotate-90" : ""}`} />
                Plus
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {secondaryItems.map(renderNavItem)}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {/* Bottom section: Settings + Profile */}
        <div className="mt-auto">
          <div className="mx-3 border-t border-sidebar-border" />
          
          {/* Settings (admin only) */}
          {isAdmin && (
            <SidebarGroup className="py-1">
              <SidebarGroupContent>
                <SidebarMenu>
                  {renderNavItem({ title: "Paramètres", url: "/admin/settings", icon: Settings })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* Profile */}
          <div className="px-3 py-3 group-data-[collapsible=icon]:px-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 w-full hover:bg-sidebar-accent/50 p-1.5 rounded-lg transition-colors group-data-[collapsible=icon]:justify-center">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-medium flex-shrink-0 overflow-hidden">
                    {adminInfo?.profileImage ? (
                      <img 
                        src={`${adminInfo.profileImage}?t=${Date.now()}`} 
                        alt="Profile" 
                        className="w-full h-full object-cover" 
                      />
                    ) : adminInfo ? (
                      <span>{`${adminInfo.firstName.charAt(0)}${adminInfo.lastName.charAt(0)}`}</span>
                    ) : (
                      <span>...</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left group-data-[collapsible=icon]:hidden">
                    <div className="flex items-center gap-1">
                      <p className="text-[13px] font-medium text-sidebar-foreground truncate">
                        {adminInfo ? `${adminInfo.firstName} ${adminInfo.lastName}` : '...'}
                      </p>
                      <ChevronDown className="h-3 w-3 text-sidebar-foreground/30 flex-shrink-0" />
                    </div>
                    <p className="text-[11px] text-sidebar-foreground/50">{userRole}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-48">
                <DropdownMenuItem asChild className="cursor-pointer">
                  <NavLink to="/profile" className="flex items-center w-full">
                    <User className="mr-2 h-4 w-4" />
                    <span>Profil</span>
                  </NavLink>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer">
                  <NavLink to="/admin/support" className="flex items-center w-full">
                    <LifeBuoy className="mr-2 h-4 w-4" />
                    <span>Support</span>
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

          {/* Collapse toggle */}
          <div className="px-3 pb-3 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:pb-2 flex justify-end">
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-md text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-sidebar-foreground/70 transition-colors"
            >
              <ChevronsLeft className={`h-3.5 w-3.5 transition-transform duration-200 ${isCollapsed ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
