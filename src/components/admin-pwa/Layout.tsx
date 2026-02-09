import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, useLayoutEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminTabBar from "./TabBar";
import { setNotificationClickHandler, getPendingNotificationUrl } from "@/hooks/useOneSignal";

const AdminPwaLayout = () => {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const location = useLocation();

  // Scroll to top on every route change
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // Set up notification click handler for push notifications
  useEffect(() => {
    const pendingUrl = getPendingNotificationUrl();
    if (pendingUrl) {
      navigate(pendingUrl);
    }

    setNotificationClickHandler((url: string) => {
      if (url.startsWith('/')) {
        navigate(url);
      }
    });
  }, [navigate]);

  // Fetch unread notification count
  useEffect(() => {
    const fetchUnreadCount = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);

      setUnreadCount(count || 0);
    };

    fetchUnreadCount();

    // Listen for realtime changes
    const channel = supabase
      .channel("admin-pwa-layout-notifications")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
        },
        () => {
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Hide TabBar on booking detail and create pages
  const shouldShowTabBar =
    !location.pathname.includes('/admin-pwa/booking/') &&
    !location.pathname.includes('/admin-pwa/create');

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <main
        className="flex-1 overflow-y-auto overscroll-y-none"
        style={{
          paddingBottom: shouldShowTabBar
            ? "calc(64px + env(safe-area-inset-bottom, 0px))"
            : undefined
        }}
      >
        <Outlet />
      </main>

      {shouldShowTabBar && <AdminTabBar unreadCount={unreadCount} />}
    </div>
  );
};

export default AdminPwaLayout;
