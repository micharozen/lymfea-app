import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import i18n from "@/i18n";
import { getDateLocale, useDateLocale } from "@/lib/dateLocale";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Mail, Sparkles, X } from "lucide-react";
import { Link } from "react-router-dom";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useCreateBookingMutation, type CreateBookingPayload } from "@/hooks/booking/useCreateBookingMutation";

import type { EmailInquiry, EmailInquiryParsedData, EmailInquiryStatus } from "@/hooks/inbox/useEmailInquiries";
import {
  type AutoConvertHotel,
  type AutoConvertTreatment,
  type AutoConvertVariant,
  bodyAsClientNote,
  buildInitialValues,
  canAutoConvert,
  isOutOfHours,
  splitPhone,
} from "./autoConvertInquiry";
import { InquiryThreadView } from "./InquiryThreadView";
import { ReplyDraftComposer } from "./ReplyDraftComposer";

const BookingModal = lazy(() => import("@/components/booking/BookingModal"));

interface Props {
  inquiry: EmailInquiry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

/** Seuils partagés avec canAutoConvert() : 0.8 = auto possible, 0.5 = à revoir. */
function confidenceTone(score: number): "ok" | "wait" | "bad" {
  if (score >= 0.8) return "ok";
  if (score >= 0.5) return "wait";
  return "bad";
}

const STATUS_TONE: Record<EmailInquiryStatus, "ok" | "wait" | "info" | "bad" | "mute"> = {
  received: "mute",
  parsed: "info",
  replied: "wait",
  converted: "ok",
  dismissed: "mute",
  failed: "bad",
};

function useConvertedBooking(bookingId: string | null | undefined) {
  return useQuery({
    queryKey: ["inbox-converted-booking", bookingId],
    enabled: Boolean(bookingId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, booking_id, customer_id, client_first_name, client_last_name, booking_date, booking_time, status, created_at")
        .eq("id", bookingId!)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        booking_id: number | null;
        customer_id: string | null;
        client_first_name: string | null;
        client_last_name: string | null;
        booking_date: string | null;
        booking_time: string | null;
        status: string | null;
        created_at: string | null;
      } | null;
    },
  });
}

/** Ligne clé/valeur de la fiche latérale. */
function Kv({ label, value }: { label: string; value: React.ReactNode }) {
  const filled = value !== null && value !== undefined && value !== "";
  return (
    <div>
      <span className="k">{label}</span>
      <span className={`v${filled ? "" : " na"}`}>{filled ? value : "—"}</span>
    </div>
  );
}

/** "sam. 16 août · 14:00" — tolère une date absente ou illisible. */
function formatWhen(date: string | null | undefined, time: string | null | undefined): string | null {
  const parts: string[] = [];
  if (date) {
    const d = new Date(date);
    parts.push(Number.isNaN(d.getTime()) ? date : format(d, "EEE d MMM", { locale: getDateLocale(i18n.language) }));
  }
  if (time) parts.push(time);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function useMatchedTreatment(treatmentId: string | null | undefined, variantId: string | null | undefined) {
  return useQuery({
    queryKey: ["inbox-match", treatmentId, variantId],
    enabled: Boolean(treatmentId || variantId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let treatment: { name: string | null; name_en: string | null } | null = null;
      let variant: { label: string | null; label_en: string | null; duration: number | null; guest_count: number | null } | null = null;
      if (treatmentId) {
        const { data } = await supabase
          .from("treatment_menus" as never)
          .select("name, name_en")
          .eq("id", treatmentId)
          .maybeSingle();
        treatment = (data as typeof treatment) ?? null;
      }
      if (variantId) {
        const { data } = await supabase
          .from("treatment_variants" as never)
          .select("label, label_en, duration, guest_count")
          .eq("id", variantId)
          .maybeSingle();
        variant = (data as typeof variant) ?? null;
      }
      return { treatment, variant };
    },
  });
}

function ConvertedSection({
  bookingId,
  t,
  onNavigate,
}: {
  bookingId: string;
  t: (k: string, opts?: Record<string, unknown>) => string;
  onNavigate: () => void;
}) {
  const dateLocale = useDateLocale();
  const { data: booking, isLoading } = useConvertedBooking(bookingId);
  const clientName = booking
    ? [booking.client_first_name, booking.client_last_name].filter(Boolean).join(" ") || t("inbox.detail.unknownClient", { defaultValue: "Client" })
    : "";
  const ref = booking?.booking_id ? `#${booking.booking_id}` : "";
  const when = booking?.booking_date
    ? `${booking.booking_date}${booking.booking_time ? ` · ${booking.booking_time}` : ""}`
    : null;
  const convertedAt = booking?.created_at
    ? format(new Date(booking.created_at), t("inbox.detail.convertedAtFormat"), {
        locale: dateLocale,
      })
    : null;

  return (
    <div className="card banner-ok">
      <div className="hd">
        <h3 className="bo-sec-title">
          {t("inbox.detail.convertedTitle", { defaultValue: "Convertie en réservation" })}
        </h3>
        <span className="seg-note">
          {convertedAt && `${t("inbox.detail.convertedOn", { defaultValue: "le" })} ${convertedAt}`}
          {when && `${convertedAt ? " · " : ""}${when}`}
        </span>
      </div>
      {isLoading ? (
        <p className="card-empty">{t("inbox.detail.loading", { defaultValue: "Chargement…" })}</p>
      ) : !booking ? (
        <p className="card-empty">{t("inbox.detail.bookingNotFound", { defaultValue: "Réservation introuvable" })}</p>
      ) : (
        <div className="banner-links">
          <Link className="bo-btn sm outline" to={`/admin/bookings/${booking.id}`} onClick={onNavigate}>
            {t("inbox.detail.viewBooking", { defaultValue: "Voir la réservation" })} {ref}
            <ArrowRight className="h-3 w-3" />
          </Link>
          {booking.customer_id && (
            <Link className="bo-btn sm outline" to={`/admin/customers/${booking.customer_id}`} onClick={onNavigate}>
              {t("inbox.detail.viewCustomer", { defaultValue: "Voir le client" })} · {clientName}
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Fiche de la demande : une phrase de synthèse, ce qui manque à
 * l'auto-conversion, puis le détail en lignes clé/valeur.
 */
function InquiryFacts({ parsed, t }: { parsed: EmailInquiryParsedData; t: (k: string, o?: Record<string, unknown>) => string }) {
  const fullName = [parsed.client_first_name, parsed.client_last_name].filter(Boolean).join(" ");
  const tm = parsed.treatment_match;
  const vm = parsed.variant_match;
  const { data: match } = useMatchedTreatment(tm?.id, vm?.id);

  const treatmentName = tm?.id
    ? match?.treatment?.name ?? match?.treatment?.name_en ?? `${tm.id.slice(0, 8)}…`
    : null;

  const variantText = (() => {
    if (!vm?.id) return null;
    const v = match?.variant;
    const parts: string[] = [];
    const label = v?.label ?? v?.label_en ?? "";
    if (label) parts.push(label);
    const durationStr = v?.duration ? `${v.duration} min` : "";
    if (durationStr && !label.toLowerCase().includes(durationStr.toLowerCase())) parts.push(durationStr);
    if (v?.guest_count) parts.push(`${v.guest_count} pers.`);
    return parts.length > 0 ? parts.join(" · ") : `${vm.id.slice(0, 8)}…`;
  })();

  const withScore = (text: string | null, confidence: number | null | undefined) =>
    text ? (
      <>
        {text} <span className="score">{Math.round((confidence ?? 0) * 100)}%</span>
      </>
    ) : null;

  const when = formatWhen(parsed.requested_date, parsed.requested_time);

  // Une phrase, pas une grille : c'est ce que l'utilisateur lit en premier.
  const summary = [
    parsed.guest_count ? `${parsed.guest_count} pers.` : null,
    treatmentName,
    variantText,
    when,
  ].filter(Boolean);

  // Mêmes champs que canAutoConvert() — la ligne explique le bouton auto grisé.
  const missing = [
    treatmentName ? null : t("inbox.detail.treatment"),
    variantText ? null : t("inbox.detail.variant"),
    parsed.requested_date ? null : t("inbox.detail.date"),
    parsed.requested_time ? null : t("inbox.detail.time"),
  ].filter(Boolean) as string[];

  return (
    <>
      {summary.length > 0 ? (
        <p className="rail-sum">{summary.join(" · ")}</p>
      ) : (
        <p className="rail-sum dim">{t("inbox.detail.notParsed")}</p>
      )}

      {missing.length > 0 && (
        <div className="rail-missing">
          <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />
          <span>
            {t("inbox.detail.missingLine", {
              defaultValue: "Il manque : {{fields}}",
              fields: missing.join(", ").toLowerCase(),
            })}
          </span>
        </div>
      )}

      <div className="kv">
        <Kv label={t("inbox.detail.client")} value={fullName || null} />
        <Kv label={t("inbox.detail.email")} value={parsed.email} />
        <Kv label={t("inbox.detail.phone")} value={parsed.phone} />
        <Kv label={t("inbox.detail.guests")} value={parsed.guest_count?.toString()} />
        <Kv label={t("inbox.detail.dateTime")} value={when} />
        <Kv label={t("inbox.detail.treatment")} value={withScore(treatmentName, tm?.confidence)} />
        <Kv label={t("inbox.detail.variant")} value={withScore(variantText, vm?.confidence)} />
      </div>

      {parsed.notes && (
        <details className="rail-notes">
          <summary>{t("inbox.detail.notes")}</summary>
          <p>{parsed.notes}</p>
        </details>
      )}
    </>
  );
}

export function EmailInquiryDetail({ inquiry, open, onOpenChange, onChanged }: Props) {
  const { t } = useTranslation(["admin", "common"]);
  const [busy, setBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  // Auto-convert: capture the inquiry+hotel context for the mutation closure.
  const [autoCtx, setAutoCtx] = useState<{
    inquiry: EmailInquiry;
    hotel: AutoConvertHotel;
  } | null>(null);
  const pendingPayloadRef = useRef<CreateBookingPayload | null>(null);

  const autoMutation = useCreateBookingMutation({
    hotels: autoCtx ? ([autoCtx.hotel] as unknown as Parameters<typeof useCreateBookingMutation>[0]["hotels"]) : [],
    therapists: [],
    onSuccess: async (data) => {
      if (!data || !autoCtx) return;
      try {
        const { error } = await supabase
          .from("email_inquiries" as never)
          .update({ status: "converted", booking_id: data.id })
          .eq("id", autoCtx.inquiry.id);
        if (error) throw error;
        toast.success(t("inbox.detail.autoConverted", { defaultValue: "Réservation créée" }));
        setAutoCtx(null);
        onChanged?.();
        onOpenChange(false);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed";
        toast.error(msg);
      }
    },
  });

  // Fire the mutation once the hotel context is in state (so the hook's closure sees it).
  useEffect(() => {
    if (!autoCtx) return;
    const payload = pendingPayloadRef.current;
    if (!payload) return;
    pendingPayloadRef.current = null;
    autoMutation.mutate(payload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCtx]);

  // Reset the composer when switching inquiries or closing the sheet.
  useEffect(() => {
    setComposerOpen(false);
  }, [inquiry?.id, open]);

  if (!inquiry) return null;

  const dismiss = async () => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("email_inquiries" as never)
        .update({ status: "dismissed" })
        .eq("id", inquiry.id);
      if (error) throw error;
      toast.success(t("inbox.detail.dismissed"));
      onChanged?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleAutoConvert = async () => {
    const p = inquiry.parsed_data;
    if (!inquiry.hotel_id || !p?.treatment_match?.id || !p.variant_match?.id || !p.requested_date || !p.requested_time) {
      toast.error(t("inbox.detail.autoMissingFields", { defaultValue: "Informations insuffisantes" }));
      return;
    }
    setBusy(true);
    try {
      const [hotelRes, treatmentRes, variantRes] = await Promise.all([
        supabase
          .from("hotels")
          .select("id, name, slot_interval, opening_time, closing_time")
          .eq("id", inquiry.hotel_id)
          .maybeSingle(),
        supabase
          .from("treatment_menus" as never)
          .select("id, name, duration, price, price_on_request")
          .eq("id", p.treatment_match.id)
          .maybeSingle(),
        supabase
          .from("treatment_variants" as never)
          .select("id, duration, price, guest_count")
          .eq("id", p.variant_match.id)
          .maybeSingle(),
      ]);

      const hotel = hotelRes.data as unknown as AutoConvertHotel | null;
      const treatment = treatmentRes.data as unknown as AutoConvertTreatment | null;
      const variant = variantRes.data as unknown as AutoConvertVariant | null;

      if (!hotel || !treatment) {
        toast.error(t("inbox.detail.autoLookupFailed", { defaultValue: "Hôtel ou soin introuvable" }));
        return;
      }

      if (treatment.price_on_request === true) {
        toast.error(t("inbox.detail.autoPriceOnRequest", { defaultValue: "Prix sur demande — utilisez Réviser et convertir" }));
        return;
      }

      const { countryCode, phone } = splitPhone(p.phone);
      const totalPrice = (variant?.price ?? treatment.price ?? 0) as number;
      const totalDuration = (variant?.duration ?? treatment.duration ?? 60) as number;
      const guestCount = (variant?.guest_count ?? p.guest_count ?? 1) as number;

      const payload: CreateBookingPayload = {
        hotelId: hotel.id,
        clientFirstName: (p.client_first_name ?? "Client").trim(),
        clientLastName: (p.client_last_name ?? "").trim(),
        clientEmail: p.email ?? inquiry.from_address ?? undefined,
        phone,
        countryCode,
        roomNumber: "",
        clientType: "external",
        clientNote: bodyAsClientNote(inquiry),
        date: p.requested_date,
        time: p.requested_time,
        therapistId: "",
        slot2Date: null,
        slot2Time: null,
        slot3Date: null,
        slot3Time: null,
        treatmentIds: [treatment.id],
        treatments: [{ treatmentId: treatment.id, variantId: variant?.id }],
        totalPrice,
        totalDuration,
        isAdmin: true,
        isOutOfHours: isOutOfHours(p.requested_time, hotel),
        surchargeAmount: 0,
        guestCount,
        source: "email",
        emailInquiryId: inquiry.id,
      };

      pendingPayloadRef.current = payload;
      setAutoCtx({ inquiry, hotel });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const isTerminal = inquiry.status === "dismissed" || inquiry.status === "converted";
  const autoEnabled = !isTerminal && !!inquiry.hotel_id && canAutoConvert(inquiry);
  const reviewEnabled = !isTerminal && !!inquiry.hotel_id;
  const autoBusy = autoMutation.isPending || (busy && pendingPayloadRef.current !== null);
  const disabled = busy || autoBusy;
  const statusTone = STATUS_TONE[inquiry.status] ?? "mute";
  const confTone = inquiry.confidence_score !== null ? confidenceTone(inquiry.confidence_score) : null;
  const clientName = [inquiry.parsed_data?.client_first_name, inquiry.parsed_data?.client_last_name]
    .filter(Boolean)
    .join(" ");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="bo-refonte inbox-sheet w-full sm:max-w-[980px] p-0 gap-0 flex flex-col [&>button]:hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <TooltipProvider delayDuration={150}>
          <div className="inbox-head">
            <div className="min-w-0 flex-1">
              <SheetTitle className="subj">{inquiry.subject ?? t("inbox.noSubject")}</SheetTitle>
              <SheetDescription asChild>
                <div className="meta">
                  <span className={`inbox-chip ${statusTone}`}>
                    <i className="bo-dot" />
                    {t(`inbox.status.${inquiry.status}`)}
                  </span>
                  {clientName && <span>{clientName} ·</span>}
                  <span className="addr">{inquiry.from_address}</span>
                  <span className="addr">· {format(new Date(inquiry.created_at), "dd/MM/yyyy HH:mm")}</span>
                </div>
              </SheetDescription>
            </div>
            <button type="button" className="x" onClick={() => onOpenChange(false)} aria-label={t("inbox.detail.close")}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="inbox-cols">
            {/* Colonne gauche : le mail, héros de l'écran, et sa zone de réponse. */}
            <div className="inbox-thread-col">
              <div className="thread-scroll">
                <InquiryThreadView rootInquiryId={inquiry.id} rootFallback={inquiry} />
              </div>
              {!isTerminal && (
                <div className="compose-dock">
                  {composerOpen ? (
                    <ReplyDraftComposer
                      inquiryId={inquiry.id}
                      defaultRecipient={inquiry.parsed_data?.email ?? inquiry.from_address}
                      smtpSender={inquiry.from_address}
                      onClose={() => setComposerOpen(false)}
                      onSent={() => {
                        setComposerOpen(false);
                        onChanged?.();
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="bo-btn outline reply-cta"
                      onClick={() => setComposerOpen(true)}
                      disabled={disabled}
                    >
                      <Mail className="h-[15px] w-[15px]" strokeWidth={1.5} />
                      {t("inbox.detail.reply.replyAction", { defaultValue: "Répondre" })}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Colonne droite : la fiche de la demande + les actions. */}
            <aside className="inbox-rail">
              <div className="rail-scroll">
                <div className="rail-head">
                  <h3 className="bo-sec-title">
                    <Sparkles className="h-[15px] w-[15px]" strokeWidth={1.5} />
                    {t("inbox.detail.aiTitle", { defaultValue: "Analyse IA" })}
                  </h3>
                  {confTone && inquiry.confidence_score !== null && (
                    <span className={`conf ${confTone}`}>
                      <span className="track">
                        <i style={{ width: `${Math.round(inquiry.confidence_score * 100)}%` }} />
                      </span>
                      <span className="pct">{Math.round(inquiry.confidence_score * 100)}%</span>
                    </span>
                  )}
                </div>

                {inquiry.parsed_data
                  ? <InquiryFacts parsed={inquiry.parsed_data} t={t} />
                  : <p className="rail-sum dim">{t("inbox.detail.notParsed")}</p>}

                {inquiry.status === "converted" && inquiry.booking_id && (
                  <ConvertedSection bookingId={inquiry.booking_id} t={t} onNavigate={() => onOpenChange(false)} />
                )}

                {inquiry.error_message && (
                  <div className="card banner-bad">
                    <div className="hd">
                      <h3 className="bo-sec-title">{t("inbox.detail.errorTitle")}</h3>
                    </div>
                    <p>{inquiry.error_message}</p>
                  </div>
                )}
              </div>

              <div className="inbox-actions">
                {isTerminal ? (
                  <button type="button" className="bo-btn outline" onClick={() => onOpenChange(false)}>
                    {t("inbox.detail.close")}
                  </button>
                ) : (
                  <>
                    {/* Une seule action pleine à la fois : l'auto quand elle est possible,
                        sinon la révision manuelle — toujours un chemin évident. */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <button
                            type="button"
                            className={`bo-btn ${autoEnabled ? "primary" : "outline"}`}
                            onClick={handleAutoConvert}
                            disabled={disabled || !autoEnabled}
                          >
                            <Sparkles className="h-[15px] w-[15px]" strokeWidth={1.5} />
                            {t("inbox.detail.autoConvertAction", { defaultValue: "Convertir automatiquement" })}
                          </button>
                        </span>
                      </TooltipTrigger>
                      {!autoEnabled && (
                        <TooltipContent side="left" className="bo-refonte metric-help-tip">
                          {t("inbox.detail.autoDisabledReason", {
                            defaultValue: "Soin, variante, date, heure et confiance ≥ 80% requis",
                          })}
                        </TooltipContent>
                      )}
                    </Tooltip>
                    <button
                      type="button"
                      className={`bo-btn ${autoEnabled ? "outline" : "primary"}`}
                      onClick={() => setReviewOpen(true)}
                      disabled={disabled || !reviewEnabled}
                    >
                      {t("inbox.detail.reviewAction", { defaultValue: "Réviser et convertir" })}
                    </button>
                    <button
                      type="button"
                      className="bo-btn ghost danger"
                      onClick={dismiss}
                      disabled={disabled}
                    >
                      {t("inbox.detail.dismissAction")}
                    </button>
                  </>
                )}
              </div>
            </aside>
          </div>
        </TooltipProvider>

        {reviewOpen && (
          <Suspense fallback={null}>
            <BookingModal
              open={reviewOpen}
              onOpenChange={setReviewOpen}
              initialValues={buildInitialValues(inquiry)}
              source="email"
              emailInquiryId={inquiry.id}
              onCreated={async (booking) => {
                try {
                  await supabase
                    .from("email_inquiries" as never)
                    .update({ status: "converted", booking_id: booking.id })
                    .eq("id", inquiry.id);
                  onChanged?.();
                } catch (e) {
                  const msg = e instanceof Error ? e.message : "Failed";
                  toast.error(msg);
                }
              }}
            />
          </Suspense>
        )}
      </SheetContent>
    </Sheet>
  );
}
