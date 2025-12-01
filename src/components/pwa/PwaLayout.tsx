import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import TabBar from "./TabBar";

const PwaLayout = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const location = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);
  const [transitionStage, setTransitionStage] = useState("fadeIn");

  useEffect(() => {
    if (location !== displayLocation) {
      setTransitionStage("fadeOut");
    }
  }, [location, displayLocation]);

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
      <TabBar unreadCount={unreadCount} />
    </div>
  );
};

export default PwaLayout;
