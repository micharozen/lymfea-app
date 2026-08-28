import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Bell,
  BellOff,
  CheckCheck,
  CheckCircle,
  ChevronLeft,
  Mail,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { oneSignalSubscribe, oneSignalUnsubscribe, isOneSignalSubscribed, isOneSignalReady, getOneSignalDiagnostics } from "@/hooks/useOneSignal";
import { AppLoader } from "@/components/AppLoader";
import { useIsMounted } from "@/hooks/useIsMounted";

interface Notification {
  id: string;
  booking_id: string | null;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
}

interface PwaNotificationsProps {
  standalone?: boolean;
}

/** Geste de swipe en cours sur une rangée : position de départ + décalage courant. */
interface SwipeState {
  id: string;
  startX: number;
  offset: number;
}

const SWIPE_MAX = 100;
const SWIPE_DELETE_THRESHOLD = 80;

const PwaNotifications = ({ standalone = false }: PwaNotificationsProps) => {
  const { t, i18n } = useTranslation('pwa');
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [swipe, setSwipe] = useState<SwipeState | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMountedRef = useIsMounted();
  
  const dateLocale = i18n.language === 'fr' ? fr : enUS;

  // Check initial push subscription status
  useEffect(() => {
    setPushEnabled(isOneSignalSubscribed());
  }, []);

  // Load notifications - use cache first, then refresh in background
  useEffect(() => {
    const loadNotifications = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check for cached data first - show immediately if available
      const cachedNotifications = queryClient.getQueryData<Notification[]>(["notifications", user.id]);
      
      if (cachedNotifications && isMountedRef.current) {
        setNotifications(cachedNotifications);
        setLoading(false);
      }

      // Always fetch fresh data in background
      fetchNotifications();
    };

    loadNotifications();
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;

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
          if (!cancelled && isMountedRef.current) {
            fetchNotifications();
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchNotifications = async () => {
    if (!isMountedRef.current) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (!isMountedRef.current) return;

      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!isMountedRef.current) return;

      if (error) throw error;
      
      queryClient.setQueryData(["notifications", user.id], data);
      setNotifications(data || []);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      if (isMountedRef.current) {
        toast.error(t('common:errors.generic'));
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
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
      toast.success(t('notifications.allMarkedRead'));
    } catch (error) {
      console.error("Error marking all as read:", error);
      toast.error(t('common:errors.generic'));
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
      toast.success(t('notifications.deleted'));
    } catch (error) {
      console.error("Error deleting notification:", error);
      toast.error(t('common:errors.generic'));
    }
  };

  const handleTouchStart = (notificationId: string, event: React.TouchEvent) => {
    setSwipe({ id: notificationId, startX: event.touches[0].clientX, offset: 0 });
  };

  const handleTouchMove = (notificationId: string, event: React.TouchEvent) => {
    setSwipe(prev => {
      if (!prev || prev.id !== notificationId) return prev;
      const delta = event.touches[0].clientX - prev.startX;
      // Swipe vers la gauche uniquement, plafonné à SWIPE_MAX.
      return { ...prev, offset: Math.max(-SWIPE_MAX, Math.min(0, delta)) };
    });
  };

  const handleTouchEnd = async (notificationId: string) => {
    const offset = swipe?.id === notificationId ? swipe.offset : 0;
    setSwipe(null);

    if (offset <= -SWIPE_DELETE_THRESHOLD) {
      await deleteNotification(notificationId);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }
    
    if (notification.booking_id) {
      navigate(`/pwa/booking/${notification.booking_id}`, { state: { from: 'notifications' } });
    }
  };

  // Pastille d'icône : la teinte suit les tokens de statut de la refonte
  // (moss = ok, gold = à traiter, clay = attention) plutôt que le rouge système.
  const getNotificationVisual = (type: string): { tone: string; icon: JSX.Element } => {
    switch (type) {
      case "new_booking":
        return { tone: "due", icon: <Bell size={16} /> };
      case "booking_cancelled":
        return { tone: "warn", icon: <XCircle size={16} /> };
      case "booking_taken":
      case "booking_confirmed":
        return { tone: "ok", icon: <CheckCircle size={16} /> };
      case "payment_failed":
        return { tone: "warn", icon: <AlertCircle size={16} /> };
      default:
        return { tone: "info", icon: <Mail size={16} /> };
    }
  };

  const handleTogglePushNotifications = async (enabled: boolean) => {
    setPushLoading(true);
    try {
      // Check if OneSignal is ready
      if (!isOneSignalReady()) {
        const diagnostics = getOneSignalDiagnostics();
        console.log('[PwaNotifications] OneSignal diagnostics:', diagnostics);

        if (diagnostics.notificationPermission === 'denied') {
          toast.error(t('notifications.pushBlocked'));
        } else {
          // Check if iOS and not installed as PWA
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
          const isStandalone = window.matchMedia('(display-mode: standalone)').matches
            || (window.navigator as any).standalone;

          if (isIOS && !isStandalone) {
            toast.error(t('notifications.pushUnavailableIOS'));
          } else {
            toast.error(t('notifications.pushUnavailable'));
          }
        }
        setPushLoading(false);
        return;
      }

      if (enabled) {
        // Check browser permission first
        const initialPermission = Notification.permission;
        if (initialPermission === 'denied') {
          toast.error(t('notifications.pushBlockedSettings'));
          setPushLoading(false);
          return;
        }
        
        const success = await oneSignalSubscribe();
        if (success) {
          setPushEnabled(true);
          toast.success(t('notifications.pushEnabled'));
        } else {
          // Check permission again after failed subscribe
          const finalPermission = Notification.permission;
          if (finalPermission === 'denied') {
            toast.error(t('notifications.pushDenied'));
          } else {
            toast.error(t('notifications.pushError'));
          }
        }
      } else {
        await oneSignalUnsubscribe();
        setPushEnabled(false);
        toast.success(t('notifications.pushDisabled'));
      }
    } catch (error) {
      console.error('[PwaNotifications] Error:', error);
      toast.error(t('common:errors.generic'));
    } finally {
      setPushLoading(false);
    }
  };

  const handleSendTestNotification = async () => {
    setTestLoading(true);
    const { data, error } = await invokeEdgeFunction<
      { scope: "self" },
      { sent: number; undelivered: number }
    >("send-notification-test", { body: { scope: "self" } });
    setTestLoading(false);

    if (error) {
      toast.error(t('notifications.testError'));
      return;
    }
    if ((data?.undelivered ?? 0) > 0) {
      toast.error(t('notifications.testUndelivered'));
      return;
    }
    toast.success(t('notifications.testSent'));
  };

  const notificationsList = notifications || [];
  const unreadCount = notificationsList.filter(n => !n.read).length;

  const header = (
    <header className="hdr" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
      {standalone && (
        <button
          className="back-btn"
          onClick={() => navigate("/pwa/profile")}
          aria-label={t('common:buttons.back')}
        >
          <ChevronLeft size={18} />
        </button>
      )}
      <span style={{ fontSize: 18, fontWeight: 400 }}>{t('notifications.title')}</span>
      <div className="spacer" />
      {unreadCount > 0 && (
        <button
          className="hdr-icon-btn"
          onClick={markAllAsRead}
          aria-label={t('notifications.markAllRead')}
        >
          <CheckCheck size={15} />
        </button>
      )}
    </header>
  );

  // Only show loader on very first load when we have no data at all
  if (loading && notificationsList.length === 0 && notifications === null) {
    return (
      <div className="app-refonte flex flex-1 flex-col">
        {header}
        <AppLoader fullScreen={false} className="flex-1" />
      </div>
    );
  }

  return (
    <div className="app-refonte flex flex-1 flex-col">
      {header}

      {/* Réglage des notifications push */}
      <div className="notif-push">
        <div className="row">
          <span className="ic">
            <Bell size={16} />
          </span>
          <div className="tx">
            <Label htmlFor="push-notifications" className="t">
              {t('notifications.pushNotifications')}
            </Label>
            <span className="s">{t('notifications.pushDescription')}</span>
          </div>
          <Switch
            id="push-notifications"
            checked={pushEnabled}
            onCheckedChange={handleTogglePushNotifications}
            disabled={pushLoading}
          />
        </div>

        <button
          className="notif-test"
          disabled={!pushEnabled || testLoading}
          onClick={handleSendTestNotification}
        >
          {testLoading ? t('notifications.testSending') : t('notifications.testButton')}
        </button>
      </div>

      {/* Liste - pas de scroll propre, le conteneur PWA scrolle */}
      {notificationsList.length === 0 ? (
        <div className="placeholder">
          <BellOff size={26} />
          <div className="big">{t('notifications.noNotifications')}</div>
          <p>{t('notifications.willBeNotified')}</p>
        </div>
      ) : (
        <div className="pb-4">
          {notificationsList.map((notification) => {
            const isSwiping = swipe?.id === notification.id && swipe.offset < 0;
            const offset = isSwiping ? swipe.offset : 0;
            const { tone, icon } = getNotificationVisual(notification.type);

            return (
              <div key={notification.id} className="notif-swipe">
                <div className="swipe-bg">
                  <Trash2 size={16} />
                </div>

                <div
                  className={`notif-row${notification.read ? "" : " unread"}`}
                  onTouchStart={(e) => handleTouchStart(notification.id, e)}
                  onTouchMove={(e) => handleTouchMove(notification.id, e)}
                  onTouchEnd={() => handleTouchEnd(notification.id)}
                  style={{
                    transform: `translateX(${offset}px)`,
                    transition: isSwiping ? "none" : "transform 0.3s ease-out",
                  }}
                >
                  <button
                    className="notif-main"
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <span className={`ic ${tone}`}>{icon}</span>
                    <span className="tx">
                      <span className="msg">{notification.message}</span>
                      <span className="when">
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                          locale: dateLocale,
                        })}
                      </span>
                    </span>
                  </button>

                  {!notification.read && <span className="dot" />}

                  <button
                    className="notif-del"
                    onClick={(e) => deleteNotification(notification.id, e)}
                    aria-label={t('notifications.deleteNotification')}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PwaNotifications;
