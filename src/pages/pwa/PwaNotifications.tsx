import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Check, CheckCheck, Trash2, Bell } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { usePushNotifications } from "@/hooks/usePushNotifications";

interface Notification {
  id: string;
  booking_id: string | null;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
}

const PwaNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [swipeStates, setSwipeStates] = useState<Record<string, number>>({});
  const navigate = useNavigate();
  const { permission, isSubscribed, requestPermission, unsubscribe } = usePushNotifications();

  useEffect(() => {
    fetchNotifications();
  }, []);

  // Realtime listener for new notifications
  useEffect(() => {
    const channel = supabase
      .channel('notifications-live')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications'
        },
        () => {
          fetchNotifications();
        }
      )
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
      setNotifications(data || []);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      toast.error("Erreur lors du chargement");
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

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
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

      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      toast.success("Toutes les notifications marquées comme lues");
    } catch (error) {
      console.error("Error marking all as read:", error);
      toast.error("Erreur");
    }
  };

  const deleteNotification = async (notificationId: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }
    
    try {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", notificationId);

      if (error) throw error;

      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      toast.success("Notification supprimée");
    } catch (error) {
      console.error("Error deleting notification:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleTouchStart = (notificationId: string, event: React.TouchEvent) => {
    const touch = event.touches[0];
    setSwipeStates(prev => ({
      ...prev,
      [notificationId]: touch.clientX
    }));
  };

  const handleTouchMove = (notificationId: string, event: React.TouchEvent) => {
    const touch = event.touches[0];
    const startX = swipeStates[notificationId];
    if (startX !== undefined) {
      const diff = startX - touch.clientX;
      if (diff > 0) { // Only allow swipe left
        setSwipeStates(prev => ({
          ...prev,
          [notificationId]: -Math.min(diff, 100)
        }));
      }
    }
  };

  const handleTouchEnd = async (notificationId: string) => {
    const swipeDistance = Math.abs(swipeStates[notificationId] || 0);
    
    if (swipeDistance > 80) {
      // Delete if swiped far enough
      await deleteNotification(notificationId);
    }
    
    // Reset swipe state
    setSwipeStates(prev => {
      const newState = { ...prev };
      delete newState[notificationId];
      return newState;
    });
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }
    
    if (notification.booking_id) {
      navigate(`/pwa/booking/${notification.booking_id}`, { state: { from: 'notifications' } });
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "new_booking":
        return "🔔";
      case "booking_cancelled":
        return "❌";
      case "booking_taken":
        return "✅";
      default:
        return "📬";
    }
  };

  const handleTogglePushNotifications = async (enabled: boolean) => {
    if (enabled) {
      const success = await requestPermission();
      if (!success) {
        toast.error('Impossible d\'activer les notifications');
      }
    } else {
      await unsubscribe();
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/pwa/profile")}
              className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-semibold">Notifications</h1>
              {unreadCount > 0 && (
                <p className="text-xs text-gray-500">
                  {unreadCount} non lu{unreadCount > 1 ? "es" : "e"}
                </p>
              )}
            </div>
          </div>
          
          {unreadCount > 0 && (
            <Button
              onClick={markAllAsRead}
              variant="ghost"
              size="sm"
              className="text-xs"
            >
              <CheckCheck className="h-4 w-4 mr-1" />
              Tout marquer comme lu
            </Button>
          )}
        </div>
      </div>

      {/* Push Notifications Settings */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-gray-500" />
            <div>
              <Label htmlFor="push-notifications" className="text-sm font-medium">
                Notifications Push
              </Label>
              <p className="text-xs text-gray-500">
                Recevez des alertes en temps réel
              </p>
            </div>
          </div>
          <Switch
            id="push-notifications"
            checked={permission === 'granted' && isSubscribed}
            onCheckedChange={handleTogglePushNotifications}
          />
        </div>
      </div>

      {/* Notifications List */}
      <div className="pb-20">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="text-6xl mb-4">🔕</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Aucune notification
            </h3>
            <p className="text-sm text-gray-500">
              Vous serez notifié des nouvelles réservations et mises à jour
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {notifications.map((notification) => {
              const swipeOffset = swipeStates[notification.id] || 0;
              const isSwipingNumber = typeof swipeOffset === 'number' && swipeOffset < 0;
              
              return (
                <div key={notification.id} className="relative overflow-hidden">
                  {/* Delete background that shows when swiping */}
                  <div className="absolute inset-0 bg-destructive flex items-center justify-end px-6">
                    <Trash2 className="h-5 w-5 text-white" />
                  </div>
                  
                  {/* Notification content */}
                  <button
                    onClick={() => handleNotificationClick(notification)}
                    onTouchStart={(e) => handleTouchStart(notification.id, e)}
                    onTouchMove={(e) => handleTouchMove(notification.id, e)}
                    onTouchEnd={() => handleTouchEnd(notification.id)}
                    style={{
                      transform: isSwipingNumber ? `translateX(${swipeOffset}px)` : 'translateX(0)',
                      transition: isSwipingNumber ? 'none' : 'transform 0.3s ease-out'
                    }}
                    className={`w-full text-left px-4 py-4 hover:bg-gray-50 transition-colors relative ${
                      !notification.read ? "bg-blue-50" : "bg-white"
                    }`}
                  >
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 text-2xl">
                        {getNotificationIcon(notification.type)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${!notification.read ? "font-semibold text-gray-900" : "text-gray-700"}`}>
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatDistanceToNow(new Date(notification.created_at), {
                            addSuffix: true,
                            locale: fr
                          })}
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
                          aria-label="Supprimer la notification"
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
};

export default PwaNotifications;
