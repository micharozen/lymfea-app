import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import TabBar from "./TabBar";

const PwaLayout = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const location = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);
  const [transitionStage, setTransitionStage] = useState("fadeIn");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (location !== displayLocation) {
      setTransitionStage("fadeOut");
    }
  }, [location, displayLocation]);

  // Prefetch adjacent pages data
  useEffect(() => {
    const prefetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get hairdresser ID for prefetching
      const { data: hairdresserData } = await supabase
        .from("hairdressers")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!hairdresserData) return;

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
          .from("hairdresser_hotels")
          .select("hotel_id")
          .eq("hairdresser_id", hairdresserData.id);

        if (affiliatedHotels && affiliatedHotels.length > 0) {
          const hotelIds = affiliatedHotels.map(h => h.hotel_id);

          // Prefetch my bookings
          queryClient.prefetchQuery({
            queryKey: ["myBookings", hairdresserData.id],
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
                .eq("hairdresser_id", hairdresserData.id)
                .in("hotel_id", hotelIds);
              return data;
            },
          });

          // Prefetch pending bookings
          queryClient.prefetchQuery({
            queryKey: ["pendingBookings", hairdresserData.id],
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
                .is("hairdresser_id", null)
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
      .channel("pwa-layout-notifications")
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

  // Hide TabBar on booking detail pages
  const shouldShowTabBar = !location.pathname.includes('/pwa/booking/');

  return (
    <div className="flex flex-col h-[100dvh] bg-white overflow-hidden">
      <div 
        className={`flex-1 overflow-y-auto overflow-x-hidden transition-opacity duration-150 ${
          transitionStage === "fadeOut" ? "opacity-0" : "opacity-100"
        }`}
        onTransitionEnd={() => {
          if (transitionStage === "fadeOut") {
            setDisplayLocation(location);
            setTransitionStage("fadeIn");
          }
        }}
      >
        <Outlet key={displayLocation.pathname} />
      </div>
      {shouldShowTabBar && <TabBar unreadCount={unreadCount} />}
    </div>
  );
};

export default PwaLayout;
