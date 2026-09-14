import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  getBookingStatusConfig,
  getCalendarFlowStage,
  calendarFlowStages,
  calendarFlowStageOrder,
} from "@/utils/statusStyles";
import PwaCalendarView from "@/components/pwa/PwaCalendarView";
import PwaDayView, { DayViewBooking } from "@/components/pwa/PwaDayView";
import type { TherapistRates, TreatmentRateMap } from "@/lib/therapistEarnings";
import { myLegSlot } from "@/lib/myLegSlot";
import { splitSharedBookingLegs } from "@/lib/sharedBookingLegs";
import PwaPageLoader from "@/components/pwa/PageLoader";
import { Button } from "@/components/ui/button";
import { useRefetchOnFocus } from "@/hooks/pwa/useRefetchOnFocus";
import { useCurrentTherapist } from "@/hooks/pwa/useCurrentTherapist";
import { useConciergeVenues } from "@/hooks/pwa/useConciergeVenues";
import {
  useMyBookingsWindow,
  useMyNextBookings,
  useVenueBookingsWindow,
  useVenueNextBookings,
  type PwaBooking,
} from "@/hooks/pwa/usePwaBookings";
import {
  extendWindowBack,
  planningWindow,
  type BookingWindow,
} from "@/lib/pwaBookingWindow";

type BookingsView = "day" | "calendar" | "list";

/**
 * Nombre minimum de rendez-vous à venir que la vue Liste doit montrer, quitte à
 * aller chercher au-delà de la fenêtre chargée. Aligné sur le tableau de bord.
 */
const MIN_UPCOMING = 3;

const VIEW_STORAGE_KEY = "pwa-bookings-view";
const SELECTED_DATE_STORAGE_KEY = "pwa-calendar-date";

/**
 * Réservation « à moi » dans l'agenda du lieu : elle m'est affectée, je porte
 * l'une de ses prestations (duo), ou j'ai accepté la demande de diffusion.
 */
function isMyBooking(b: PwaBooking, therapistId: string | null | undefined): boolean {
  if (!therapistId) return false;
  if (b.therapist_id === therapistId) return true;
  if ((b.booking_treatments ?? []).some((bt) => bt.therapist_id === therapistId)) return true;
  return (b.booking_therapists ?? []).some(
    (bt) => bt.therapist_id === therapistId && bt.status === "accepted",
  );
}

const PwaBookings = () => {
  const { t } = useTranslation("pwa");
  const navigate = useNavigate();

  const [view, setView] = useState<BookingsView>(() => {
    const stored = typeof window !== "undefined" ? sessionStorage.getItem(VIEW_STORAGE_KEY) : null;
    if (stored === "day" || stored === "calendar" || stored === "list") return stored;
    return "day";
  });
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const stored = typeof window !== "undefined" ? sessionStorage.getItem(SELECTED_DATE_STORAGE_KEY) : null;
    if (stored) {
      const d = new Date(stored);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });

  // Date pilotant la fenêtre de chargement. La vue Jour la fait suivre
  // `selectedDate` ; la vue 3 jours la remonte depuis son propre état de semaine.
  const [anchorDate, setAnchorDate] = useState<Date>(selectedDate);
  // Nombre de mois d'historique ajoutés par « voir plus ancien » (vue Liste).
  const [extraMonths, setExtraMonths] = useState(0);

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/pwa/dashboard");
  };

  const { data: me } = useCurrentTherapist();
  const therapist = me?.therapist ?? null;

  // Un thérapeute qui gère aussi le lieu (concierge) voit directement l'agenda
  // complet du lieu : plus de bascule « Mes RDV / Tout le lieu », qui l'obligeait
  // à faire l'aller-retour pour suivre sa journée. Ses propres rendez-vous sont
  // distingués dans la grille (`isMine`). La requête ne part que depuis cette
  // page, et court-circuite pour les autres thérapeutes.
  const { data: conciergeHotelIds = [] } = useConciergeVenues(me?.userId);
  const isConcierge = conciergeHotelIds.length > 0;

  const therapistRates: TherapistRates | null = useMemo(
    () =>
      therapist
        ? {
            rate_30: therapist.rate_30,
            rate_45: therapist.rate_45,
            rate_60: therapist.rate_60,
            rate_75: therapist.rate_75,
            rate_90: therapist.rate_90,
            rate_105: therapist.rate_105,
            rate_120: therapist.rate_120,
            rate_150: therapist.rate_150,
          }
        : null,
    [therapist],
  );

  // Le flag est honoré ici : le moteur ne reçoit jamais une map inactive.
  const therapistTreatmentRates: TreatmentRateMap | null = useMemo(
    () => (therapist?.treatment_rates_active ? therapist.treatment_rates ?? null : null),
    [therapist],
  );

  const anchorKey = format(anchorDate, "yyyy-MM-dd");
  const window_: BookingWindow = useMemo(() => {
    const base = planningWindow(new Date(`${anchorKey}T00:00:00`));
    return extraMonths > 0 ? extendWindowBack(base, extraMonths) : base;
  }, [anchorKey, extraMonths]);

  const venueScope = isConcierge;

  const mine = useMyBookingsWindow(therapist?.id, window_, { enabled: !venueScope });
  const venue = useVenueBookingsWindow(conciergeHotelIds, window_, { enabled: venueScope });

  const active = venueScope ? venue : mine;
  const bookings: PwaBooking[] = useMemo(() => active.data ?? [], [active.data]);

  const todayKey = format(new Date(), "yyyy-MM-dd");

  // Rendez-vous à venir déjà présents dans la fenêtre chargée.
  const upcomingInWindow = useMemo(
    () => bookings.filter((b) => b.booking_date >= todayKey && b.status !== "cancelled").length,
    [bookings, todayKey],
  );

  // Même filet que le tableau de bord : la fenêtre s'arrête à la fin du mois
  // affiché, donc un prochain rendez-vous plus lointain laissait une liste vide.
  // Il vaut aussi pour l'agenda du lieu, à l'échelle du lieu : le gérant doit
  // voir l'à-venir complet, ses propres rendez-vous s'y distinguant par leur
  // badge comme partout ailleurs.
  const needsNext =
    view === "list" &&
    window_.to >= todayKey &&
    !active.isPending &&
    upcomingInWindow < MIN_UPCOMING;

  const myNext = useMyNextBookings(therapist?.id, window_.to, MIN_UPCOMING, {
    enabled: needsNext && !venueScope,
  });
  const venueNext = useVenueNextBookings(conciergeHotelIds, window_.to, MIN_UPCOMING, {
    enabled: needsNext && venueScope,
  });
  const nextBeyondWindow = venueScope ? venueNext : myNext;
  const beyondWindowBookings: PwaBooking[] = view === "list" ? nextBeyondWindow.data ?? [] : [];

  useEffect(() => {
    try {
      sessionStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      // ignore
    }
  }, [view]);

  useEffect(() => {
    try {
      sessionStorage.setItem(SELECTED_DATE_STORAGE_KEY, selectedDate.toISOString());
    } catch {
      // ignore
    }
  }, [selectedDate]);

  // La vue Jour pilote directement la fenêtre ; la vue 3 jours passe par
  // onVisibleRangeChange, la vue Liste garde la dernière ancre connue.
  useEffect(() => {
    if (view === "day") setAnchorDate(selectedDate);
  }, [view, selectedDate]);

  const handleVisibleRangeChange = useCallback((firstVisibleDay: Date) => {
    setAnchorDate((prev) =>
      format(prev, "yyyy-MM-dd") === format(firstVisibleDay, "yyyy-MM-dd") ? prev : firstVisibleDay,
    );
  }, []);

  // Changer d'ancre repart d'une fenêtre non élargie.
  useEffect(() => {
    setExtraMonths(0);
  }, [anchorKey]);

  // Pas de realtime sur bookings : c'est le retour au premier plan qui purge
  // les lignes devenues obsolètes (réservation réattribuée entre-temps).
  useRefetchOnFocus(() => {
    void active.refetch();
  });


  // Cancelled bookings stay visible in the list (traceability) but never on the
  // Day / 3-day grids: in "venue" scope they aren't filtered server-side, so a
  // cancelled slot would overlay — and hide — the booking that replaced it.
  // Sur une réservation partagée, chaque praticien ne travaille que sa jambe :
  // un bloc unique couvrant toute la réservation annonce à chacun une heure
  // qu'il ne travaille pas. Mon agenda ne montre donc que ma jambe ; l'agenda du
  // lieu les montre toutes, une par praticien, pour garder lisible l'occupation
  // continue de la salle.
  const scheduleBookings = bookings
    .filter((b) => b.status !== "cancelled")
    .flatMap((b) =>
      venueScope
        ? splitSharedBookingLegs(b)
        : [{ ...b, ...myLegSlot(b, therapist?.id), legKey: b.id, legTherapistId: null }],
    );

  // Sur une jambe identifiée, l'appartenance se lit sur la jambe : une
  // réservation partagée est « à moi » pour un bloc et pas pour l'autre.
  const isMyLeg = (b: { legTherapistId: string | null } & PwaBooking) =>
    b.legTherapistId ? b.legTherapistId === therapist?.id : isMyBooking(b, therapist?.id);

  const dayViewBookings: DayViewBooking[] = scheduleBookings.map((b) => ({
    id: b.id,
    legKey: b.legKey,
    booking_id: b.booking_id,
    booking_date: b.booking_date,
    booking_time: b.booking_time,
    client_first_name: b.client_first_name,
    client_last_name: b.client_last_name,
    hotel_name: b.hotel_name,
    room_number: b.room_number,
    room_name: b.room_name,
    status: b.status,
    payment_status: b.payment_status,
    phone: b.phone,
    duration: b.duration,
    total_price: b.total_price,
    guest_count: b.guest_count,
    booking_treatments: b.booking_treatments,
    therapistName: b.therapistName,
    // En agenda du lieu seulement : hors de ce mode toutes les lignes sont
    // siennes, un marquage n'y distinguerait rien.
    isMine: venueScope ? isMyLeg(b) : undefined,
  }));

  // Legend mirrors the admin/concierge planning: reservation-flow stages
  // (status + payment) shown in lifecycle order, deduped to what's on screen.
  const calendarBookings = venueScope
    ? scheduleBookings.map((b) => ({ ...b, isMine: isMyLeg(b) }))
    : scheduleBookings;

  const legendSource = view === "list" ? [...bookings, ...beyondWindowBookings] : scheduleBookings;
  const legendStages = calendarFlowStageOrder.filter((key) =>
    legendSource.some((b) => getCalendarFlowStage(b.status, b.payment_status).key === key),
  );

  const renderBookingRow = (booking: PwaBooking) => {
    const mine = venueScope && isMyBooking(booking, therapist?.id);
    return (
    <button
      key={booking.id}
      className="bk-row"
      // Le liseré ne signale plus le statut — le badge de droite le porte déjà —
      // mais mes rendez-vous. Transparent sinon, pour que les lignes restent
      // alignées.
      style={{ borderLeft: `3px solid ${mine ? "var(--accent)" : "transparent"}` }}
      onClick={() => navigate(`/pwa/booking/${booking.id}`)}
    >
      <div className="bk-main">
        <div className="who">
          {booking.client_first_name} {booking.client_last_name}
          {(booking.guest_count ?? 1) > 1 && (
            <span className="status info"><span className="dot" />Duo</span>
          )}
        </div>
        <div className="what">
          {booking.booking_id ? `#${booking.booking_id} · ` : ""}
          {format(new Date(booking.booking_date), "PPP", { locale: fr })} · {booking.booking_time.substring(0, 5)}
        </div>
        <div className="meta">
          {booking.hotel_name}
          {booking.room_number ? ` · Ch. ${booking.room_number}` : ""}
          {booking.room_name ? ` · ${booking.room_name}` : ""}
          {booking.therapistName ? ` · ${booking.therapistName}` : ""}
        </div>
      </div>
      <div className="bk-right">
        <span className={cn("px-2 py-1 rounded text-[11px] font-medium", getBookingStatusConfig(booking.status).badgeClass)}>
          {getBookingStatusConfig(booking.status).label}
        </span>
      </div>
    </button>
    );
  };

  if (active.isPending) {
    return <PwaPageLoader title={t("bookings.title")} />;
  }

  return (
    <div className="app-refonte flex h-full min-h-0 flex-col">
      <header className="hdr" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
        <button className="back-btn" onClick={goBack} aria-label={t("common:buttons.back")}>
          <ChevronLeft size={18} />
        </button>
        <span style={{ fontSize: 18, fontWeight: 400 }}>{t("bookings.title")}</span>
        <div className="spacer" />
        <div className="seg">
          <button className={view === "day" ? "on" : ""} onClick={() => setView("day")}>
            {t("bookings.viewDay", "Jour")}
          </button>
          <button className={view === "calendar" ? "on" : ""} onClick={() => setView("calendar")}>
            {t("bookings.view3Days", "3 jours")}
          </button>
          <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>
            {t("bookings.viewList", "Liste")}
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col">
        {(venueScope || legendStages.length > 0) && (
          <div className="px-4 pb-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {venueScope && (
                <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--ink-mute)" }}>
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: "var(--accent)" }}
                  />
                  {t("bookings.mineLegend", "Mes rendez-vous")}
                </span>
              )}
              {legendStages.map((key) => {
                const stage = calendarFlowStages[key];
                return (
                  <span key={key} className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--ink-mute)" }}>
                    <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", stage.swatchClass)} />
                    {t(stage.labelKey, { ns: "common" })}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {view === "day" ? (
          <div className="flex-1 min-h-0">
            <PwaDayView
              bookings={dayViewBookings}
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              onBookingClick={(booking) => navigate(`/pwa/booking/${booking.id}`)}
              onSlotClick={(date, time) => navigate(`/pwa/new-booking?date=${date}&time=${time}`)}
              therapistRates={therapistRates}
              therapistTreatmentRates={therapistTreatmentRates}
            />
          </div>
        ) : view === "calendar" ? (
          <div className="flex-1 min-h-0">
            <PwaCalendarView
              bookings={calendarBookings}
              onBookingClick={(booking) => navigate(`/pwa/booking/${booking.id}`)}
              onSlotClick={(date, time) => navigate(`/pwa/new-booking?date=${date}&time=${time}`)}
              onVisibleRangeChange={handleVisibleRangeChange}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-auto pt-2 pb-4">
            {/* La liste ne couvre plus tout l'historique mais la fenêtre chargée :
                sans cette légende, une liste vide se lirait « données perdues »
                au lieu de « rien sur cette période ». */}
            <p className="px-4 pb-2 text-[11px]" style={{ color: "var(--ink-mute)" }}>
              {t("bookings.periodLabel", {
                from: format(new Date(`${window_.from}T00:00:00`), "d MMM yyyy", { locale: fr }),
                to: format(new Date(`${window_.to}T00:00:00`), "d MMM yyyy", { locale: fr }),
              })}
            </p>

            {/* En tête de liste, pas en pied : les réservations sont triées du
                plus ancien au plus récent, remonter le temps se fait donc vers
                le haut. */}
            <div className="px-4 pb-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setExtraMonths((n) => n + 1)}
                disabled={active.isFetching}
              >
                {t("bookings.loadOlder")}
              </Button>
            </div>

            {bookings.length === 0 ? (
              <div className="placeholder">
                <p>{t("bookings.empty", "Aucune réservation trouvée")}</p>
              </div>
            ) : (
              bookings.map(renderBookingRow)
            )}

            {/* Rendez-vous situés après la fenêtre chargée. Sous leur propre
                titre : la légende de période ci-dessus serait contredite si on
                les fondait dans les lignes de la période. */}
            {beyondWindowBookings.length > 0 && (
              <>
                <div className="sec-label">{t("bookings.beyondPeriod")}</div>
                {beyondWindowBookings.map(renderBookingRow)}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PwaBookings;
