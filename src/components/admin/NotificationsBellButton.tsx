import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr as frLocale, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

interface NotificationItem {
  id: string;
  type: string;
  message: string;
  booking_id: string | null;
  read: boolean;
  created_at: string;
}

const TYPE_LABEL_FR: Record<string, string> = {
  new_booking: "Nouvelle réservation",
  booking_cancelled: "Annulation",
  therapist_arrived: "Arrivée",
  noshow: "No-show",
};

const TYPE_LABEL_EN: Record<string, string> = {
  new_booking: "New booking",
  booking_cancelled: "Cancellation",
  therapist_arrived: "Arrival",
  noshow: "No-show",
};

const TYPE_COLOR: Record<string, string> = {
  new_booking: "bg-green-500",
  booking_cancelled: "bg-red-500",
  therapist_arrived: "bg-blue-500",
  noshow: "bg-amber-500",
};

export function NotificationsBellButton({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isFr = i18n.language?.startsWith("fr");
  const locale = isFr ? frLocale : enUS;

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const unreadCount = items.filter((n) => !n.read).length;

  useEffect(() => {
    let isMounted = true;

    const fetchNotifs = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isMounted) return;

      setLoading(true);
      const { data } = await supabase
        .from("notifications")
        .select("id, type, message, booking_id, read, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (isMounted) {
        setItems((data ?? []) as NotificationItem[]);
        setLoading(false);
      }
    };

    fetchNotifs();

    const channel = supabase
      .channel(`notifications-bell-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => fetchNotifs()
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const badgeLabel = unreadCount > 9 ? "9+" : String(unreadCount);

  const markRead = async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  };

  const markAllRead = async () => {
    const unreadIds = items.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase.from("notifications").update({ read: true }).in("id", unreadIds);
  };

  const deleteNotif = async (id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("notifications").delete().eq("id", id);
  };

  const handleClick = async (notif: NotificationItem) => {
    if (!notif.read) await markRead(notif.id);
    setOpen(false);
    if (notif.booking_id) navigate(`/admin/bookings/${notif.booking_id}`);
  };

  const labelFor = (type: string) =>
    (isFr ? TYPE_LABEL_FR[type] : TYPE_LABEL_EN[type]) ?? type;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          className={cn(
            "relative p-2 rounded-md hover:bg-muted transition-colors",
            className
          )}
        >
          <Bell className="h-[18px] w-[18px] text-foreground" strokeWidth={1.75} />
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 bg-destructive text-destructive-foreground text-[11px] font-semibold leading-none tabular-nums rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-[3px] ring-2 ring-background">
              {badgeLabel}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-medium text-sm">
            Notifications
            {unreadCount > 0 && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({unreadCount} {isFr ? "non lues" : "unread"})
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={markAllRead}
            >
              {isFr ? "Tout marquer lu" : "Mark all read"}
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[420px]">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {isFr ? "Chargement…" : "Loading…"}
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              <Bell className="h-6 w-6 mx-auto mb-2 opacity-40" />
              {isFr ? "Aucune notification" : "No notifications"}
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((notif) => (
                <li
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className={cn(
                    "group relative px-4 py-3 cursor-pointer hover:bg-muted/60 transition-colors",
                    !notif.read && "bg-primary/5"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 rounded-full shrink-0",
                        TYPE_COLOR[notif.type] ?? "bg-muted-foreground"
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                          {labelFor(notif.type)}
                        </span>
                        {!notif.read && (
                          <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                        )}
                      </div>
                      <p
                        className={cn(
                          "text-sm mt-0.5 line-clamp-2",
                          !notif.read ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {notif.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(notif.created_at), {
                          addSuffix: true,
                          locale,
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!notif.read && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            markRead(notif.id);
                          }}
                          className="p-1 rounded hover:bg-background"
                          title={isFr ? "Marquer lu" : "Mark read"}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotif(notif.id);
                        }}
                        className="p-1 rounded hover:bg-background"
                        title={isFr ? "Supprimer" : "Delete"}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        <div className="border-t px-4 py-2">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/admin/schedule-alerts?tab=notifications");
            }}
            className="w-full text-center text-sm text-primary hover:underline py-1"
          >
            {isFr ? "Voir toutes les notifications" : "View all notifications"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
