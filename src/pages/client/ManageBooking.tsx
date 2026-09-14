import { useState, useMemo, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, differenceInMinutes, addDays, startOfDay } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import {
  MapPin,
  Phone,
  DoorOpen,
  ChevronRight,
  AlertTriangle,
  Info,
  Loader2,
  Pencil,
  X,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import TimePeriodSelector from "@/components/client/TimePeriodSelector";
import { toast } from "sonner";
import { brand, brandLogos } from "@/config/brand";
import ambienceImage from "@/assets/welcome-bg-couple.jpg";
import { CancelBookingDialog } from "@/components/booking/CancelBookingDialog";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { hoursUntilBooking } from "@/lib/cancellationTiers";
import { resolveClientLanguage, type ClientLanguage } from "@/lib/clientLanguage";

interface HotelInfo {
  id: string;
  name: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  contact_phone: string | null;
  opening_time: string | null;
  closing_time: string | null;
  slot_interval: number | null;
  timezone: string | null;
  client_cancellation_cutoff_hours: number | null;
  cover_image: string | null;
}

interface BookingTreatmentRow {
  id: string;
  treatment_id: string;
  treatment: {
    id: string;
    name: string | null;
    name_en: string | null;
    duration: number | null;
    price: number | null;
  } | null;
}

interface BookingRow {
  id: string;
  booking_id: number | string;
  booking_date: string;
  booking_time: string;
  client_first_name: string | null;
  client_last_name: string | null;
  phone: string | null;
  client_email: string | null;
  hotel_id: string;
  hotel_name: string | null;
  room_number: string | null;
  total_price: number | null;
  status: string;
  payment_method: string | null;
  payment_status: string | null;
  card_brand: string | null;
  card_last4: string | null;
  estimated_price: number | null;
  language: "fr" | "en" | null;
  /** Langue de la fiche client — prioritaire sur `language` (cf. resolveClientLanguage). */
  customer_language: string | null;
  /** Délai minimum avant le soin en deçà duquel le déplacement en ligne est fermé. */
  reschedule_cutoff_hours: number | null;
  booking_treatments: BookingTreatmentRow[] | null;
  hotels: HotelInfo | null;
}

/** Verdicts renvoyés par reschedule_booking_public. */
interface RescheduleResult {
  success: boolean;
  error?: string;
  cutoff_hours?: number;
  was_confirmed?: boolean;
  reconfirm_therapists?: number;
}

const ManageBooking = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const { t, i18n } = useTranslation("client");
  const queryClient = useQueryClient();

  const [showConfirmCancelDialog, setShowConfirmCancelDialog] = useState(false);
  const [showLateWarningDialog, setShowLateWarningDialog] = useState(false);
  const [lateAction, setLateAction] = useState<"cancel" | "reschedule">("cancel");
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  // Incrémenté pour reprendre les disponibilités quand un créneau est parti sous
  // nos pieds : la date sélectionnée ne change pas, l'effet doit rejouer quand même.
  const [slotsRefreshKey, setSlotsRefreshKey] = useState(0);

  const { data: booking, isLoading, error } = useQuery<BookingRow | null>({
    queryKey: ["client-booking", bookingId],
    queryFn: async () => {
      // Use SECURITY DEFINER RPC to bypass the restrictive anon RLS policy on
      // bookings. Accepts either a UUID (/booking/manage/:uuid) or a base62
      // short_token (/m/:token) — the SQL function handles both.
      const { data: rows, error } = await supabase
        .rpc("get_public_booking", { p_token: bookingId! });

      if (error) throw error;
      const data = (rows?.[0] ?? null) as BookingRow | null;
      if (!data) return null;

      let hotelInfo: HotelInfo | null = null;
      if (data.hotel_id) {
        const { data: hotelRows } = await supabase.rpc("get_public_hotel_by_id", {
          _hotel_id: data.hotel_id,
        });
        const h = Array.isArray(hotelRows) ? hotelRows[0] : hotelRows;
        if (h) {
          hotelInfo = {
            id: h.id,
            name: h.name ?? null,
            address: h.address ?? null,
            postal_code: h.postal_code ?? null,
            city: h.city ?? null,
            contact_phone: h.contact_phone ?? null,
            opening_time: h.opening_time ?? null,
            closing_time: h.closing_time ?? null,
            slot_interval: h.slot_interval ?? null,
            timezone: h.timezone ?? null,
            client_cancellation_cutoff_hours: Number(h.client_cancellation_cutoff_hours ?? 2),
            cover_image: h.cover_image ?? null,
          };
        }
      }

      return { ...(data as unknown as BookingRow), hotels: hotelInfo };
    },
    enabled: !!bookingId,
  });

  // Annuler et déplacer n'obéissent pas au même délai : le lieu peut laisser
  // annuler tard (client_cancellation_cutoff_hours, 2h par défaut) tout en fermant
  // le déplacement bien plus tôt (client_reschedule_cutoff_hours, 24h par défaut),
  // parce qu'un créneau déplacé doit être re-staffé.
  const timeInfo = useMemo(() => {
    if (!booking) return null;
    const bookingDateTime = parseISO(`${booking.booking_date}T${booking.booking_time}`);
    const minutesUntilAppointment = differenceInMinutes(bookingDateTime, new Date());
    const cancelCutoffHours = Number(booking.hotels?.client_cancellation_cutoff_hours ?? 2);
    const rescheduleCutoffHours = Number(booking.reschedule_cutoff_hours ?? 24);
    const hoursUntil = hoursUntilBooking(
      booking.booking_date,
      booking.booking_time,
      booking.hotels?.timezone ?? "UTC",
    );
    return {
      bookingDateTime,
      canCancel: hoursUntil != null && hoursUntil > cancelCutoffHours,
      canReschedule: hoursUntil != null && hoursUntil > rescheduleCutoffHours,
      isPast: minutesUntilAppointment < 0,
      cancelCutoffHours,
      rescheduleCutoffHours,
    };
  }, [booking]);

  // customers.language fait foi : c'est la préférence durable du client, partagée
  // par toutes ses réservations. bookings.language n'est qu'une dérivation par
  // réservation (indicatif au moment de la création) qu'un chemin de création peut
  // laisser à son défaut — d'où le simple rôle de repli. Même règle que
  // supabase/functions/_shared/client-language.ts.
  const language: ClientLanguage = resolveClientLanguage(
    booking?.customer_language,
    booking?.language,
  );
  const dateLocale = language === "en" ? enUS : fr;
  const hotel = booking?.hotels ?? null;

  // name_en n'est pas toujours renseigné : le libellé FR reste le repli.
  const treatmentName = (treatment: BookingTreatmentRow["treatment"]) =>
    (language === "en" ? treatment?.name_en : null) || treatment?.name || "—";

  // La page est ouverte depuis un SMS ou un e-mail envoyé dans cette langue-là :
  // elle doit s'afficher dans la même, sans dépendre de la langue de session.
  useEffect(() => {
    if (i18n.resolvedLanguage?.split("-")[0] !== language) {
      i18n.changeLanguage(language);
    }
  }, [language, i18n]);

  const addressLine = useMemo(() => {
    if (!hotel) return "";
    return [hotel.address, hotel.postal_code, hotel.city].filter(Boolean).join(", ");
  }, [hotel]);

  const mapsHref = useMemo(() => {
    if (!hotel) return "";
    const q = [hotel.name, hotel.address, hotel.city].filter(Boolean).join(", ");
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }, [hotel]);

  // Aperçu cartographique via l'Embed API (iframe) plutôt que le SDK JS : pas de
  // chargement de bundle Maps pour une carte statique non interactive. On cible
  // l'adresse seule — un nom de spa absent de Google renverrait « no results ».
  const mapsEmbedSrc = useMemo(() => {
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
    if (!key || !addressLine) return "";
    return `https://www.google.com/maps/embed/v1/place?key=${key}&q=${encodeURIComponent(
      addressLine,
    )}&zoom=15&language=${language}`;
  }, [addressLine, language]);

  const timeSlotOptions = useMemo(() => {
    if (!hotel) return [];
    const openingStr = hotel.opening_time ?? "10:00";
    const closingStr = hotel.closing_time ?? "20:00";
    const slotInterval = hotel.slot_interval ?? 30;

    const parseMin = (t: string) => {
      const [h, m] = t.split(":");
      return parseInt(h, 10) * 60 + parseInt(m ?? "0", 10);
    };
    const openingMinutes = parseMin(openingStr);
    const closingMinutes = parseMin(closingStr);

    const slots: { value: string; label: string; hour: number }[] = [];
    for (let minutes = openingMinutes; minutes < closingMinutes; minutes += slotInterval) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;
      const hh = hour.toString().padStart(2, "0");
      const mm = minute.toString().padStart(2, "0");
      slots.push({
        value: `${hh}:${mm}:00`,
        label: `${hh}:${mm}`,
        hour,
      });
    }
    return slots;
  }, [hotel]);

  useEffect(() => {
    if (!rescheduleOpen || !selectedDate || !booking) return;
    let cancelled = false;
    setLoadingSlots(true);
    (async () => {
      const treatmentIds = (booking.booking_treatments ?? [])
        .map((bt) => bt.treatment_id)
        .filter(Boolean);

      const { data, error: invokeError } = await invokeEdgeFunction<
        Record<string, unknown>,
        { availableSlots?: string[] }
      >("get-availability", {
        skipAuth: true,
        body: {
          hotelId: booking.hotel_id,
          date: selectedDate,
          treatmentIds,
          excludeBookingId: booking.id,
        },
      });

      if (cancelled) return;
      if (invokeError) {
        console.error("[ManageBooking] get-availability error:", invokeError);
        setAvailableSlots([]);
      } else {
        setAvailableSlots(data?.availableSlots ?? []);
      }
      setLoadingSlots(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [rescheduleOpen, selectedDate, booking, slotsRefreshKey]);

  const rescheduleMutation = useMutation<RescheduleResult, Error>({
    mutationFn: async () => {
      if (!booking || !selectedDate || !selectedTime) throw new Error("Missing date/time");
      const { data, error: updateError } = await supabase
        .rpc("reschedule_booking_public", {
          p_token: bookingId!,
          p_new_date: selectedDate,
          p_new_time: selectedTime,
        });
      if (updateError) throw updateError;

      // Le serveur revérifie tout (délai, créneau passé, salle libre) et refuse
      // sans lever d'erreur SQL : un refus arrive ici en data.success === false.
      const result = (data ?? { success: false }) as unknown as RescheduleResult;
      if (!result.success) throw new Error(result.error ?? "unknown");

      // Un déplacement rouvre le staffing. La réservation qui était confirmée
      // interroge d'abord ses praticiens ; les autres repartent au broadcast.
      await invokeEdgeFunction("trigger-new-booking-notifications", {
        skipAuth: true,
        // rescheduled : le client reçoit l'e-mail « Demande de réservation »,
        // sa réservation étant repassée en attente d'acceptation.
        body: (result.reconfirm_therapists ?? 0) > 0
          ? { bookingId: booking.id, reconfirmOnly: true, rescheduled: true }
          : { bookingId: booking.id, notifyAll: true, therapistsOnly: true, rescheduled: true },
      });

      await invokeEdgeFunction("send-booking-notification", {
        skipAuth: true,
        body: {
          bookingId: booking.id,
          language,
          channels: ["sms"],
          type: "reschedule",
          clientPhone: booking.phone ?? undefined,
        },
      });

      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["client-booking", bookingId] });
      toast.success(t("manageBooking.rescheduleSuccessTitle"), {
        description: result.was_confirmed
          ? t("manageBooking.rescheduleSuccessReconfirm")
          : t("manageBooking.rescheduleSuccessPending"),
      });
      setRescheduleOpen(false);
      setSelectedTime("");
    },
    onError: (error) => {
      // NO_ROOM_AVAILABLE : le créneau proposé vient d'être pris. Les
      // disponibilités affichées sont périmées, on les recharge.
      if (error.message === "NO_ROOM_AVAILABLE" || error.message === "past_slot") {
        setSelectedTime("");
        queryClient.invalidateQueries({ queryKey: ["client-booking", bookingId] });
        setSlotsRefreshKey((key) => key + 1);
        toast.error(t("manageBooking.slotTakenTitle"), {
          description: t("manageBooking.slotTakenDescription"),
        });
        return;
      }
      if (error.message === "too_late") {
        setRescheduleOpen(false);
        setShowLateWarningDialog(true);
        return;
      }
      toast.error(t("manageBooking.errorTitle"), {
        description: t("manageBooking.rescheduleError"),
      });
    },
  });

  const openReschedule = () => {
    if (!timeInfo) return;
    if (!timeInfo.canReschedule) {
      setLateAction("reschedule");
      setShowLateWarningDialog(true);
      return;
    }
    setSelectedDate(booking?.booking_date ?? "");
    setSelectedTime("");
    setRescheduleOpen(true);
  };

  const handleCancelClick = () => {
    if (!timeInfo) return;
    if (timeInfo.canCancel) {
      setShowConfirmCancelDialog(true);
    } else {
      setLateAction("cancel");
      setShowLateWarningDialog(true);
    }
  };

  if (isLoading) {
    return (
      <div className="app-refonte min-h-screen flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: "var(--accent)" }} />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="app-refonte min-h-screen flex flex-col items-center justify-center p-6">
        <img src={brandLogos.primary} alt={brand.name} className="h-10 mb-8" />
        <div className="card w-full max-w-md" style={{ margin: 0 }}>
          <div className="px-6 py-8 text-center">
            <AlertTriangle className="h-10 w-10 mx-auto mb-4" style={{ color: "var(--clay)" }} />
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 22, marginBottom: 6 }}>
              {t("manageBooking.notFoundTitle")}
            </h2>
            <p style={{ fontSize: 14, color: "var(--ink-mute)" }}>
              {t("manageBooking.notFoundDescription")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const lateCutoffHours = lateAction === "reschedule"
    ? (timeInfo?.rescheduleCutoffHours ?? 24)
    : (timeInfo?.cancelCutoffHours ?? 2);
  const isCancelled = booking.status === "cancelled";
  const isCompleted = booking.status === "completed";
  const hotelName = hotel?.name ?? booking.hotel_name ?? "";
  const totalPrice = Number(booking.total_price ?? 0);
  // Les clients extérieurs n'ont pas de chambre : le flux stocke "TBD" en
  // remplissage, qu'il ne faut jamais afficher tel quel.
  const roomNumber =
    booking.room_number && booking.room_number !== "TBD" ? booking.room_number : null;
  const treatments = booking.booking_treatments ?? [];
  const coverImage = hotel?.cover_image ?? null;
  const canAct = !isCancelled && !isCompleted && timeInfo != null && !timeInfo.isPast;

  // Sur desktop la photo passe dans le panneau latéral : le héro plein cadre
  // ferait doublon, on lui substitue l'en-tête sable.
  const plainHeader = (
    <>
      <div className="hdr">
        <img src={brandLogos.primary} alt={brand.name} className="h-6" />
      </div>
      <div className="fiche-head">
        <div className="venue">{hotelName}</div>
      </div>
    </>
  );

  return (
    <div className="app-refonte min-h-screen flex">
      {/* La mise en page est pensée pour le mobile : sur desktop on la recentre
          en colonne plutôt que de l'étirer, et on remplit le reste avec le
          visuel du lieu. */}
      <div className="flex-1 flex flex-col items-center">
      <div className="w-full max-w-[480px] flex-1 flex flex-col">
        {/* Héro : photo du lieu si le venue en a une, sinon en-tête sable sobre. */}
        {coverImage ? (
          <div className="relative lg:hidden">
            <img
              src={coverImage}
              alt={hotelName}
              className="w-full h-[230px] sm:h-[280px] object-cover"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(42,36,25,.82) 0%, rgba(42,36,25,.28) 45%, rgba(42,36,25,.18) 100%)",
              }}
            />
            <img
              src={brandLogos.monogramWhiteClient}
              alt={brand.name}
              className="absolute top-5 left-5 h-6 opacity-90"
              style={{ paddingTop: "env(safe-area-inset-top)" }}
            />
            <div className="absolute bottom-0 left-0 right-0 px-5 pb-5">
              <div
                style={{
                  fontFamily: "var(--serif)",
                  fontSize: 27,
                  lineHeight: 1.1,
                  letterSpacing: "-.01em",
                  color: "var(--sand-50)",
                }}
              >
                {hotelName}
              </div>
            </div>
          </div>
        ) : null}
        {coverImage ? (
          <div className="hidden lg:block">{plainHeader}</div>
        ) : (
          plainHeader
        )}

        <div className="flex-1 pb-6" style={{ paddingTop: 16 }}>
          {(isCancelled || isCompleted || booking.status === "confirmed") && (
            <div className="fiche-head" style={{ paddingTop: 0, paddingBottom: 12 }}>
              <div className="statusline" style={{ marginTop: 0 }}>
                {isCancelled && (
                  <span className="status warn">{t("manageBooking.statusCancelled")}</span>
                )}
                {isCompleted && (
                  <span className="status ok">{t("manageBooking.statusCompleted")}</span>
                )}
                {!isCancelled && !isCompleted && booking.status === "confirmed" && (
                  <span className="status ok">{t("manageBooking.statusConfirmed")}</span>
                )}
              </div>
            </div>
          )}

          {/* Date / Heure / Prestations */}
          <div className="fiche-when">
            <div className="cell">
              <div className="v">
                {format(parseISO(booking.booking_date), "EEE d MMM", { locale: dateLocale })}
              </div>
              <div className="l">{t("manageBooking.dateLabel")}</div>
            </div>
            <div className="cell">
              <div className="v">{booking.booking_time.slice(0, 5)}</div>
              <div className="l">{t("manageBooking.timeLabel")}</div>
            </div>
            <div className="cell">
              <div className="v">{treatments.length}</div>
              <div className="l">
                {t("manageBooking.treatmentsLabel", { count: treatments.length })}
              </div>
            </div>
          </div>

          {/* Soins réservés */}
          {treatments.length > 0 && (
            <div className="card">
              {treatments.map((bt) => (
                <div key={bt.id} className="soin-row">
                  <span className="nm">{treatmentName(bt.treatment)}</span>
                  {bt.treatment?.duration != null && (
                    <span className="dur">{bt.treatment.duration} min</span>
                  )}
                  {bt.treatment?.price != null && <span className="pr">{bt.treatment.price}€</span>}
                </div>
              ))}
              {totalPrice > 0 && (
                <div className="soin-row total">
                  <span className="nm">{t("manageBooking.total")}</span>
                  <span className="pr">{totalPrice}€</span>
                </div>
              )}
            </div>
          )}

          {/* Contact du lieu */}
          <div className="info-list" style={{ marginTop: 12 }}>
            {roomNumber && (
              <div className="info-row">
                <span className="ic">
                  <DoorOpen size={18} />
                </span>
                <span className="lab">{t("manageBooking.roomLabel")}</span>
                <span className="val">{roomNumber}</span>
              </div>
            )}
            {hotel?.contact_phone && (
              <a className="info-row" href={`tel:${hotel.contact_phone.replace(/\s/g, "")}`}>
                <span className="ic">
                  <Phone size={18} />
                </span>
                <span className="lab">{t("manageBooking.venuePhoneLabel")}</span>
                <span className="val" style={{ color: "var(--accent)" }}>
                  {hotel.contact_phone}
                </span>
                <ChevronRight size={16} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
              </a>
            )}
            {addressLine && (
              <a className="info-row" href={mapsHref} target="_blank" rel="noopener noreferrer">
                <span className="ic">
                  <MapPin size={18} />
                </span>
                <span className="lab">{t("manageBooking.addressLabel")}</span>
                <span className="val" style={{ color: "var(--accent)" }}>
                  {addressLine}
                  <small style={{ color: "var(--accent)" }}>
                    {t("manageBooking.openDirections")}
                  </small>
                </span>
                <ChevronRight size={16} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
              </a>
            )}
          </div>

          {/* Carte interactive : zoom et déplacement dans la page (à deux doigts sur
              mobile, pour ne pas capturer le scroll). L'itinéraire reste accessible
              par la ligne Adresse au-dessus. */}
          {mapsEmbedSrc && (
            <div
              style={{
                margin: "12px 16px 0",
                borderRadius: 16,
                overflow: "hidden",
                border: "1px solid var(--line-soft)",
              }}
            >
              <iframe
                src={mapsEmbedSrc}
                title={t("manageBooking.mapTitle", { venue: hotelName })}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                style={{ display: "block", width: "100%", height: 200, border: 0 }}
              />
            </div>
          )}

          {timeInfo?.isPast && !isCancelled && !isCompleted && (
            <p
              className="text-center"
              style={{ fontSize: 13, color: "var(--ink-mute)", margin: "20px 24px 0" }}
            >
              {t("manageBooking.pastBooking")}
            </p>
          )}
        </div>

        {canAct && (
          <div className="fiche-foot sticky bottom-0">
            <button className="btn-primary-lg" onClick={openReschedule}>
              <Pencil size={16} style={{ display: "inline", marginRight: 8, verticalAlign: -2 }} />
              {t("manageBooking.rescheduleCta")}
            </button>
            <button className="btn-ghost" onClick={handleCancelClick}>
              {t("manageBooking.cancelCta")}
            </button>
          </div>
        )}
      </div>
      </div>

      {/* Visuel latéral, desktop seulement : la photo du lieu, à défaut l'image
          d'ambiance du flux de réservation. */}
      <aside className="hidden lg:block w-1/3 max-w-[560px] shrink-0">
        <img
          src={coverImage ?? ambienceImage}
          alt=""
          aria-hidden="true"
          className="sticky top-0 h-screen w-full object-cover"
        />
      </aside>

      <Drawer open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DrawerContent className="app-refonte max-h-[92vh] sm:max-w-[480px] sm:mx-auto">
          <DrawerHeader className="relative">
            <DrawerTitle
              className="text-center"
              style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 22 }}
            >
              {t("manageBooking.drawerTitle")}
            </DrawerTitle>
            <button
              type="button"
              className="back-btn absolute right-4 top-3"
              onClick={() => setRescheduleOpen(false)}
              aria-label={t("manageBooking.close")}
            >
              <X size={18} />
            </button>
          </DrawerHeader>

          <div className="px-4 pb-2 overflow-y-auto">
            <div className="flex justify-center">
              <Calendar
                mode="single"
                locale={dateLocale}
                selected={selectedDate ? parseISO(selectedDate) : undefined}
                onSelect={(date) => {
                  if (!date) return;
                  setSelectedTime("");
                  setSelectedDate(format(date, "yyyy-MM-dd"));
                }}
                disabled={(date) => {
                  const today = startOfDay(new Date());
                  const max = addDays(today, 90);
                  return date < today || date > max;
                }}
              />
            </div>

            <div className="mt-4">
              {!selectedDate ? (
                <p className="text-center py-6" style={{ fontSize: 14, color: "var(--ink-mute)" }}>
                  {t("manageBooking.pickDate")}
                </p>
              ) : loadingSlots ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--accent)" }} />
                </div>
              ) : availableSlots.length === 0 ? (
                <p className="text-center py-6" style={{ fontSize: 14, color: "var(--ink-mute)" }}>
                  {t("manageBooking.noSlots")}
                </p>
              ) : (
                <TimePeriodSelector
                  availableSlots={availableSlots}
                  selectedTime={selectedTime}
                  onSelectTime={setSelectedTime}
                  allTimeSlots={timeSlotOptions}
                />
              )}
            </div>
          </div>

          <DrawerFooter>
            {/* reschedule_booking_public repasse toute réservation déplacée en
                'pending' : une réservation confirmée perd sa confirmation le
                temps que ses praticiens valident le nouveau créneau. Le dire
                avant la validation, pas seulement dans le toast qui suit. */}
            {booking.status === "confirmed" && (
              <div
                className="flex items-start gap-2"
                style={{
                  padding: "10px 14px",
                  borderRadius: 14,
                  background: "var(--gold-soft)",
                  color: "var(--gold-deep)",
                  fontSize: 12.5,
                  lineHeight: 1.45,
                }}
              >
                <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{t("manageBooking.reconfirmNotice")}</span>
              </div>
            )}
            <button
              className="btn-primary-lg disabled:opacity-40 disabled:shadow-none"
              disabled={!selectedDate || !selectedTime || rescheduleMutation.isPending}
              onClick={() => rescheduleMutation.mutate()}
            >
              {rescheduleMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              ) : (
                t("manageBooking.confirmSlotCta")
              )}
            </button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {booking && (
        <CancelBookingDialog
          isOpen={showConfirmCancelDialog}
          onClose={() => setShowConfirmCancelDialog(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["client-booking", bookingId] });
            setShowConfirmCancelDialog(false);
          }}
          bookingId={booking.id}
          publicToken={bookingId!}
          bookingUuid={booking.id}
          paymentPreview={{
            card_brand: booking.card_brand,
            card_last4: booking.card_last4,
            estimated_price: booking.estimated_price,
          }}
          booking={{
            booking_id: Number(booking.booking_id),
            client_first_name: booking.client_first_name ?? "",
            client_last_name: booking.client_last_name ?? "",
            total_price: Number(booking.total_price ?? 0),
            hotel_id: booking.hotel_id,
            status: booking.status,
            payment_method: booking.payment_method,
            payment_status: booking.payment_status,
            booking_date: booking.booking_date,
            booking_time: booking.booking_time,
          }}
          userRole="client"
        />
      )}

      <AlertDialog open={showLateWarningDialog} onOpenChange={setShowLateWarningDialog}>
        <AlertDialogContent
          className="app-refonte max-w-[340px] rounded-3xl border-0 p-6"
          // Voile clair + flou, comme les dialogues de l'espace admin ; le
          // bg-black/80 par défaut d'AlertDialog écrasait la page.
          overlayClassName="bg-black/40 backdrop-blur-sm"
          style={{ background: "var(--sand-50)" }}
        >
          <AlertDialogHeader className="space-y-3">
            <div
              className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: "var(--gold-soft)", color: "var(--gold-deep)" }}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <AlertDialogTitle
              className="text-center"
              style={{
                fontFamily: "var(--serif)",
                fontWeight: 400,
                fontSize: 20,
                lineHeight: 1.2,
              }}
            >
              {lateAction === "reschedule"
                ? t("manageBooking.tooLateTitleReschedule")
                : t("manageBooking.tooLateTitleCancel")}
            </AlertDialogTitle>
            <AlertDialogDescription
              className="text-center"
              style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--ink-soft)" }}
            >
              {lateAction === "reschedule"
                ? t("manageBooking.tooLateBodyReschedule", { hours: lateCutoffHours })
                : t("manageBooking.tooLateBodyCancel", { hours: lateCutoffHours })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-5 flex-col gap-2 sm:flex-col sm:space-x-0">
            {/* Appeler est la seule issue : c'est l'action principale quand le
                lieu a un numéro. Sans numéro, il ne reste qu'à fermer. */}
            {hotel?.contact_phone && (
              <a
                className="btn-primary-lg flex items-center justify-center gap-2"
                href={`tel:${hotel.contact_phone.replace(/\s/g, "")}`}
              >
                <Phone size={16} />
                {t("manageBooking.callVenue")}
              </a>
            )}
            <AlertDialogCancel className="btn-cancel mt-0">
              {t("manageBooking.close")}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ManageBooking;
