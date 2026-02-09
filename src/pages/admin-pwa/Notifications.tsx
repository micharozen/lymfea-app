import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Check, CheckCheck, Trash2, Bell } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { oneSignalSubscribe, oneSignalUnsubscribe, isOneSignalSubscribed, isOneSignalReady, getOneSignalDiagnostics } from "@/hooks/useOneSignal";
import PwaHeader from "@/components/pwa/Header";

interface Notification {
  id: string;
  booking_id: string | null;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
}

export default function AdminPwaNotifications() {
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [swipeStates, setSwipeStates] = useState<Record<string, number>>({});
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    setPushEnabled(isOneSignalSubscribed());
  }, []);

  useEffect(() => {
    const loadNotifications = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const cachedNotifications = queryClient.getQueryData<Notification[]>(["notifications", user.id]);
      if (cachedNotifications) {
        setNotifications(cachedNotifications);
        setLoading(false);
      }

      fetchNotifications();
    };
    loadNotifications();
  }, [queryClient]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-pwa-notifications-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => {
        fetchNotifications();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      queryClient.setQueryData(["notifications", user.id], data);
      setNotifications(data || []);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      toast.error("Erreur lors du chargement des notifications");
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", notificationId);
      if (error) throw error;
      setNotifications((prev) => prev?.map((n) => (n.id === notificationId ? { ...n, read: true } : n)) || null);
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);
      if (error) throw error;
      setNotifications((prev) => prev?.map((n) => ({ ...n, read: true })) || null);
      toast.success("Toutes les notifications marquées comme lues");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Erreur");
    }
  };

  const deleteNotification = async (notificationId: string, event?: React.MouseEvent) => {
    if (event) event.stopPropagation();
    try {
      const { error } = await supabase.from("notifications").delete().eq("id", notificationId);
      if (error) throw error;
      setNotifications((prev) => prev?.filter((n) => n.id !== notificationId) || null);
      toast.success("Notification supprimée");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Erreur");
    }
  };

  const handleTouchStart = (id: string, e: React.TouchEvent) => {
    setSwipeStates((prev) => ({ ...prev, [id]: e.touches[0].clientX }));
  };

  const handleTouchMove = (id: string, e: React.TouchEvent) => {
    const startX = swipeStates[id];
    if (startX !== undefined) {
      const diff = startX - e.touches[0].clientX;
      if (diff > 0) {
        setSwipeStates((prev) => ({ ...prev, [id]: -Math.min(diff, 100) }));
      }
    }
  };

  const handleTouchEnd = async (id: string) => {
    const swipeDistance = Math.abs(swipeStates[id] || 0);
    if (swipeDistance > 80) await deleteNotification(id);
    setSwipeStates((prev) => {
      const s = { ...prev };
      delete s[id];
      return s;
    });
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) await markAsRead(notification.id);
    if (notification.booking_id) {
      navigate(`/admin-pwa/booking/${notification.booking_id}`);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "new_booking": return "🔔";
      case "booking_cancelled": return "❌";
      case "booking_confirmed": return "✅";
      default: return "📬";
    }
  };

  const handleTogglePush = async (enabled: boolean) => {
    setPushLoading(true);
    try {
      if (!isOneSignalReady()) {
        const diagnostics = getOneSignalDiagnostics();
        if (diagnostics.notificationPermission === "denied") {
          toast.error("Les notifications sont bloquées dans les paramètres du navigateur");
        } else {
          toast.error("Les notifications ne sont pas disponibles");
        }
        setPushLoading(false);
        return;
      }

      if (enabled) {
        if (Notification.permission === "denied") {
          toast.error("Les notifications sont bloquées. Modifiez les paramètres de votre navigateur.");
          setPushLoading(false);
          return;
        }
        const success = await oneSignalSubscribe();
        if (success) {
          setPushEnabled(true);
          toast.success("Notifications activées");
        } else {
          toast.error("Impossible d'activer les notifications");
        }
      } else {
        await oneSignalUnsubscribe();
        setPushEnabled(false);
        toast.success("Notifications désactivées");
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("Erreur");
    } finally {
      setPushLoading(false);
    }
  };

  const notificationsList = notifications || [];
  const unreadCount = notificationsList.filter((n) => !n.read).length;

  if (loading && notificationsList.length === 0 && notifications === null) {
    return (
      <div className="flex flex-1 flex-col bg-muted/30">
        <PwaHeader title="Notifications" />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-muted/30">
      <PwaHeader
        title="Notifications"
        rightSlot={
          unreadCount > 0 ? (
            <button onClick={markAllAsRead} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
              <CheckCheck className="h-4 w-4 text-muted-foreground" />
            </button>
          ) : null
        }
      />

      {/* Push Settings */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-gray-500" />
            <div>
              <Label htmlFor="admin-push" className="text-sm font-medium">Notifications push</Label>
              <p className="text-xs text-gray-500">Recevez des alertes pour les nouvelles réservations</p>
            </div>
          </div>
          <Switch
            id="admin-push"
            checked={pushEnabled}
            onCheckedChange={handleTogglePush}
            disabled={pushLoading}
          />
        </div>
      </div>

      {/* Notifications List */}
      <div className="flex-1 min-h-0 pb-4">
        {notificationsList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="text-6xl mb-4">🔕</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune notification</h3>
            <p className="text-sm text-gray-500">Vous serez notifié des nouvelles réservations</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {notificationsList.map((notification) => {
              const swipeOffset = swipeStates[notification.id] || 0;
              const isSwiping = typeof swipeOffset === "number" && swipeOffset < 0;

              return (
                <div key={notification.id} className="relative overflow-hidden">
                  <div className="absolute inset-0 bg-destructive flex items-center justify-end px-6">
                    <Trash2 className="h-5 w-5 text-white" />
                  </div>
                  <button
                    onClick={() => handleNotificationClick(notification)}
                    onTouchStart={(e) => handleTouchStart(notification.id, e)}
                    onTouchMove={(e) => handleTouchMove(notification.id, e)}
                    onTouchEnd={() => handleTouchEnd(notification.id)}
                    style={{
                      transform: isSwiping ? `translateX(${swipeOffset}px)` : "translateX(0)",
                      transition: isSwiping ? "none" : "transform 0.3s ease-out",
                    }}
                    className={`w-full text-left px-4 py-4 hover:bg-gray-50 transition-colors relative ${
                      !notification.read ? "bg-blue-50" : "bg-white"
                    }`}
                  >
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 text-2xl">{getNotificationIcon(notification.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${!notification.read ? "font-semibold text-gray-900" : "text-gray-700"}`}>
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: fr })}
                        </p>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-2">
                        {!notification.read ? (
                          <div className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
                        ) : (
                          <Check className="h-4 w-4 text-gray-400" />
                        )}
                        <button
                          onClick={(e) => deleteNotification(notification.id, e)}
                          className="p-1.5 hover:bg-destructive/10 rounded transition-colors"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </button>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
