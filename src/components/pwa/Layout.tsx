import { Outlet, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { Suspense, useEffect, useState, useLayoutEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLoader } from "@/components/AppLoader";
import { useQueryClient } from "@tanstack/react-query";
import TabBar from "./TabBar";
import { setNotificationClickHandler, getPendingNotificationUrl } from "@/hooks/useOneSignal";
import { useIsMounted } from "@/hooks/useIsMounted";
import { isTherapistPending } from "@/hooks/useRoleRedirect";
import { useScheduleCompleteness } from "@/hooks/pwa/useScheduleCompleteness";
import { useCurrentTherapist } from "@/hooks/pwa/useCurrentTherapist";

const PwaLayout = () => {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const navigationType = useNavigationType();
  const scrollPositions = useRef<Map<string, number>>(new Map());
  const isMountedRef = useIsMounted();
  const queryClient = useQueryClient();

  // Une seule résolution d'identité pour toute la coquille. Avant, ce composant
  // faisait à lui seul trois getUser() + select sur therapists, et Dashboard et
  // Bookings en ajoutaient chacun un : cinq allers-retours pour une même ligne.
  const { data: me } = useCurrentTherapist();
  const therapistId = me?.therapist?.id ?? null;
  const userId = me?.userId ?? null;

  const { data: scheduleCompleteness } = useScheduleCompleteness(therapistId);

  // Reset scroll on navigation, but restore it on a back navigation (POP) —
  // sinon revenir du détail d'une réservation renvoyait le planning tout en haut.
  useLayoutEffect(() => {
    const main = mainRef.current;
    const positions = scrollPositions.current;
    const saved = positions.get(location.pathname);

    if (navigationType === "POP" && saved != null) {
      main?.scrollTo(0, saved);
    } else {
      window.scrollTo(0, 0);
      main?.scrollTo(0, 0);
    }

    // Le nettoyage se joue juste avant le changement de path : c'est le moment
    // "je quitte cette page", donc la bonne position à mémoriser.
    return () => {
      if (main) positions.set(location.pathname, main.scrollTop);
    };
  }, [location.pathname, navigationType]);

  // Therapists who have a session but haven't finished onboarding (pending status or
  // no password set) must complete it first. This covers users who reach the PWA shell
  // directly via the installed start_url (/pwa) — e.g. an admin who is ALSO a therapist
  // and whose therapist setup is still pending — instead of landing on an empty dashboard.
  useEffect(() => {
    if (!me?.therapist) return;
    if (isTherapistPending(me.therapist)) {
      navigate("/pwa/onboarding", { replace: true });
    }
  }, [me, navigate]);

  // Préchauffe la liste de notifications pendant que le thérapeute est sur
  // l'accueil, pour que l'onglet s'ouvre déjà peint au lieu d'afficher son
  // loader. Notifications.tsx lit cette clé avant son propre fetch puis la
  // réécrit : on rejoue donc strictement sa requête, pour qu'une seule forme
  // existe dans cette entrée de cache.
  useEffect(() => {
    if (!userId || location.pathname !== "/pwa/dashboard") return;

    const timer = window.setTimeout(() => {
      void queryClient.prefetchQuery({
        queryKey: ["notifications", userId],
        queryFn: async () => {
          const { data } = await supabase
            .from("notifications")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });
          return data;
        },
        staleTime: 30_000,
        // Sans observateur, l'entrée serait collectée au bout du gcTime global
        // de 5 min, soit bien avant la fin d'une session typique.
        gcTime: 30 * 60_000,
      });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [userId, location.pathname, queryClient]);

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

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const fetchUnreadCount = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
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
  }, [userId, isMountedRef]);

  // Hide TabBar on booking detail pages
  const shouldShowTabBar = !location.pathname.includes('/pwa/booking/') && !location.pathname.includes('/pwa/new-booking');

  return (
    <div className="notranslate h-[100dvh] flex flex-col overflow-hidden bg-background">
      {/* <main> est une colonne flex : les pages écrivent déjà `flex flex-1
          flex-col` sur leur racine, ce qui était inerte tant que ce parent
          était une boîte bloc. Plus de paddingBottom en dur non plus — la tab
          bar est dans le flux, le layout lui alloue sa place (la réservation de
          64px ne correspondait pas à sa hauteur réelle, ~80-90px, et rognait la
          dernière ligne de chaque écran). */}
      <main
        ref={mainRef}
        className="flex flex-1 min-h-0 flex-col overflow-y-auto overscroll-y-none"
      >
        {/* Boundary local : sans lui, un chunk lazy non chargé remonte jusqu'au
            Suspense au-dessus de <Routes> et fait disparaître toute la coquille
            (header + tab bar) derrière le logo plein écran. */}
        <Suspense fallback={<AppLoader fullScreen={false} className="flex-1" />}>
          <Outlet />
        </Suspense>
      </main>

      {shouldShowTabBar && (
        <TabBar
          unreadCount={unreadCount}
          scheduleIncomplete={scheduleCompleteness?.isIncomplete ?? false}
        />
      )}
    </div>
  );
};

export default PwaLayout;
