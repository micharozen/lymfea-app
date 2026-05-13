import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export function NotificationsBellButton({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const fetchUnreadCount = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isMounted) return;

      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);

      if (isMounted) setUnreadCount(count ?? 0);
    };

    fetchUnreadCount();

    const channel = supabase
      .channel("notifications-bell")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => fetchUnreadCount()
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const badgeLabel = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <button
      type="button"
      onClick={() => navigate("/admin/schedule-alerts?tab=notifications")}
      aria-label="Notifications"
      className={cn(
        "relative p-2 rounded-md hover:bg-muted transition-colors",
        className
      )}
    >
      <Bell className="h-5 w-5 text-foreground" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
          {badgeLabel}
        </span>
      )}
    </button>
  );
}
