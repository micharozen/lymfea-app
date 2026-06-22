import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, useLayoutEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import TabBar from "./TabBar";
import { setNotificationClickHandler, getPendingNotificationUrl } from "@/hooks/useOneSignal";
import { useIsMounted } from "@/hooks/useIsMounted";
import { isTherapistPending } from "@/hooks/useRoleRedirect";

const PwaLayout = () => {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const location = useLocation();
  const queryClient = useQueryClient();
  const isMountedRef = useIsMounted();

  // Scroll to top on every route change - use useLayoutEffect for immediate execution
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // Therapists who have a session but haven't finished onboarding (pending status or
  // no password set) must complete it first. This covers users who reach the PWA shell
  // directly via the installed start_url (/pwa) — e.g. an admin who is ALSO a therapist
  // and whose therapist setup is still pending — instead of landing on an empty dashboard.
  useEffect(() => {
    let cancelled = false;

    const ensureOnboarded = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: therapist } = await supabase
        .from("therapists")
        .select("status, password_set")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!cancelled && isTherapistPending(therapist)) {
        navigate("/pwa/onboarding", { replace: true });
      }
    };

    ensureOnboarded();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // Set up notification click handler for push notifications
  useEffect(() => {
    // Check for any pending notification URL first
    const pendingUrl = getPendingNotificationUrl();
    if (pendingUrl) {
      navigate(pendingUrl);
    }

    // Set up the handler for future clicks
    setNotificationClickHandler((url: string) => {
      if (url.startsWith('/')) {
        navigate(url);
      }
    });
  }, [navigate]);

  // Prefetch adjacent pages data
  useEffect(() => {
    const prefetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get therapist ID for prefetching
      const { data: therapistData } = await supabase
        .from("therapists")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!therapistData) return;

      const currentPath = location.pathname;

      // Prefetch notifications when on dashboard
      if (currentPath === "/pwa/dashboard") {
        queryClient.prefetchQuery({
          queryKey: ["notifications", user.id],
          queryFn: async () => {
            const { data } = await supabase
              .from("notifications")
              .select("*")
              .eq("user_id", user.id)
              .order("created_at", { ascending: false });
            return data;
          },
        });
      }

      // Prefetch bookings when on notifications
      if (currentPath === "/pwa/notifications") {
        // Get affiliated hotels
        const { data: affiliatedHotels } = await supabase
          .from("therapist_venues")
          .select("hotel_id")
          .eq("therapist_id", therapistData.id);

        if (affiliatedHotels && affiliatedHotels.length > 0) {
          const hotelIds = affiliatedHotels.map(h => h.hotel_id);

          // Prefetch my bookings
          queryClient.prefetchQuery({
            queryKey: ["myBookings", therapistData.id],
            queryFn: async () => {
              const { data } = await supabase
                .from("bookings")
                .select(`
                  *,
                  booking_treatments (
                    treatment_menus (
                      price,
                      duration
                    )
                  )
                `)
                .eq("therapist_id", therapistData.id)
                .in("hotel_id", hotelIds);
              return data;
            },
          });

          // Prefetch pending bookings
          queryClient.prefetchQuery({
            queryKey: ["pendingBookings", therapistData.id],
            queryFn: async () => {
              const { data } = await supabase
                .from("bookings")
                .select(`
                  *,
                  booking_treatments (
                    treatment_menus (
                      price,
                      duration
                    )
                  )
                `)
                .in("hotel_id", hotelIds)
                .is("therapist_id", null)
                .in("status", ["En attente", "Pending"]);
              return data;
            },
          });
        }
      }
    };

    // Debounce prefetching to avoid too many requests
    const timer = setTimeout(() => {
      prefetchData();
    }, 300);

    return () => clearTimeout(timer);
  }, [location.pathname, queryClient]);

  useEffect(() => {
    let cancelled = false;

    const fetchUnreadCount = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);

      if (!cancelled && isMountedRef.current) {
        setUnreadCount(count || 0);
      }
    };

    fetchUnreadCount();

    // Listen for realtime changes
    const channel = supabase
      .channel("pwa-layout-notifications")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
        },
        () => {
          if (!cancelled && isMountedRef.current) {
            fetchUnreadCount();
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  // Hide TabBar on booking detail pages
  const shouldShowTabBar = !location.pathname.includes('/pwa/booking/') && !location.pathname.includes('/pwa/new-booking');

  return (
    <div className="notranslate min-h-[100dvh] flex flex-col bg-background">
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
      
      {shouldShowTabBar && <TabBar unreadCount={unreadCount} />}
    </div>
  );
};

export default PwaLayout;
