import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { ArrowRight, Mail } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useCreateBookingMutation, type CreateBookingPayload } from "@/hooks/booking/useCreateBookingMutation";

import type { EmailInquiry, EmailInquiryParsedData } from "@/hooks/inbox/useEmailInquiries";
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

function confidenceTone(score: number): { className: string; label: string } {
  if (score >= 0.8) {
    return { className: "border-emerald-200 bg-emerald-50 text-emerald-700", label: "high" };
  }
  if (score >= 0.5) {
    return { className: "border-amber-200 bg-amber-50 text-amber-700", label: "medium" };
  }
  return { className: "border-red-200 bg-red-50 text-red-700", label: "low" };
}

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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-sm font-medium text-right">{value || <span className="text-muted-foreground italic">—</span>}</span>
    </div>
  );
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
  const { data: booking, isLoading } = useConvertedBooking(bookingId);
  const clientName = booking
    ? [booking.client_first_name, booking.client_last_name].filter(Boolean).join(" ") || t("inbox.detail.unknownClient", { defaultValue: "Client" })
    : "";
  const ref = booking?.booking_id ? `#${booking.booking_id}` : "";
  const when = booking?.booking_date
    ? `${booking.booking_date}${booking.booking_time ? ` · ${booking.booking_time}` : ""}`
    : null;
  const convertedAt = booking?.created_at
    ? format(new Date(booking.created_at), "d MMM yyyy 'à' HH:mm", { locale: fr })
    : null;

  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">
          {t("inbox.detail.convertedTitle", { defaultValue: "Convertie en réservation" })}
          {convertedAt && (
            <span className="ml-2 font-normal normal-case tracking-normal text-emerald-700">
              · {t("inbox.detail.convertedOn", { defaultValue: "le" })} {convertedAt}
            </span>
          )}
        </div>
        {when && <span className="text-xs text-emerald-700 shrink-0">{when}</span>}
      </div>
      {isLoading ? (
        <p className="text-sm text-emerald-700 italic">{t("inbox.detail.loading", { defaultValue: "Chargement..." })}</p>
      ) : !booking ? (
        <p className="text-sm text-emerald-700 italic">{t("inbox.detail.bookingNotFound", { defaultValue: "Réservation introuvable" })}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100">
            <Link to={`/admin/bookings/${booking.id}`} onClick={onNavigate}>
              {t("inbox.detail.viewBooking", { defaultValue: "Voir la réservation" })} {ref}
              <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
          {booking.customer_id && (
            <Button asChild variant="outline" size="sm" className="h-8 border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100">
              <Link to={`/admin/customers/${booking.customer_id}`} onClick={onNavigate}>
                {t("inbox.detail.viewCustomer", { defaultValue: "Voir le client" })} · {clientName}
                <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ParsedSummary({ parsed, t }: { parsed: EmailInquiryParsedData; t: (k: string) => string }) {
  const fullName = [parsed.client_first_name, parsed.client_last_name].filter(Boolean).join(" ");
  const dateTime = [parsed.requested_date, parsed.requested_time].filter(Boolean).join(" · ");
  const tm = parsed.treatment_match;
  const vm = parsed.variant_match;
  const { data: match } = useMatchedTreatment(tm?.id, vm?.id);

  const treatmentLabel = (() => {
    if (!tm?.id) return null;
    const name = match?.treatment?.name ?? match?.treatment?.name_en ?? `${tm.id.slice(0, 8)}…`;
    return `${name} (${Math.round((tm.confidence ?? 0) * 100)}%)`;
  })();

  const variantLabel = (() => {
    if (!vm?.id) return null;
    const v = match?.variant;
    const parts: string[] = [];
    const label = v?.label ?? v?.label_en ?? "";
    if (label) parts.push(label);
    const durationStr = v?.duration ? `${v.duration} min` : "";
    if (durationStr && !label.toLowerCase().includes(durationStr.toLowerCase())) {
      parts.push(durationStr);
    }
    if (v?.guest_count) parts.push(`${v.guest_count} pers.`);
    const text = parts.length > 0 ? parts.join(" · ") : `${vm.id.slice(0, 8)}…`;
    return `${text} (${Math.round((vm.confidence ?? 0) * 100)}%)`;
  })();

  return (
    <div className="space-y-1">
      <Row label={t("inbox.detail.client")} value={fullName || null} />
      <Row label={t("inbox.detail.email")} value={parsed.email} />
      <Row label={t("inbox.detail.phone")} value={parsed.phone} />
      <Row label={t("inbox.detail.dateTime")} value={dateTime || null} />
      <Row label={t("inbox.detail.treatment")} value={treatmentLabel} />
      {variantLabel && <Row label={t("inbox.detail.variant", { defaultValue: "Variante" })} value={variantLabel} />}
      <Row label={t("inbox.detail.guests")} value={parsed.guest_count?.toString()} />
      {parsed.notes && (
        <div className="pt-2">
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            {t("inbox.detail.notes")}
          </div>
          <p className="text-sm whitespace-pre-wrap bg-muted/40 rounded-md p-2">{parsed.notes}</p>
        </div>
      )}
    </div>
  );
}

export function EmailInquiryDetail({ inquiry, open, onOpenChange, onChanged }: Props) {
  const { t } = useTranslation("admin");
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle className="text-base font-normal">{inquiry.subject ?? t("inbox.noSubject")}</SheetTitle>
          <SheetDescription className="text-xs">
            {format(new Date(inquiry.created_at), "dd/MM/yyyy HH:mm")} · {inquiry.from_address} → {inquiry.to_address}
          </SheetDescription>
        </SheetHeader>

        <Separator className="my-4" />

        {!isTerminal && (
          <div className="flex flex-wrap gap-2 justify-end mb-4">
            <Button
              onClick={dismiss}
              disabled={busy || autoBusy}
              className="bg-red-600 hover:bg-red-700 text-white disabled:bg-red-600/40"
            >
              {t("inbox.detail.dismissAction")}
            </Button>
            <Button
              onClick={() => setComposerOpen(true)}
              disabled={busy || autoBusy || composerOpen}
              className="gap-1.5 bg-[#0A84FF] hover:bg-[#0A6FD9] text-white disabled:bg-[#0A84FF]/40"
            >
              <Mail className="h-4 w-4" />
              {t("inbox.detail.reply.replyAction", { defaultValue: "Répondre" })}
            </Button>
            <Button
              variant="outline"
              onClick={() => setReviewOpen(true)}
              disabled={busy || autoBusy || !reviewEnabled}
            >
              {t("inbox.detail.reviewAction", { defaultValue: "Réviser et convertir" })}
            </Button>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      onClick={handleAutoConvert}
                      disabled={busy || autoBusy || !autoEnabled}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-emerald-600/40"
                    >
                      {t("inbox.detail.autoConvertAction", { defaultValue: "Convertir automatiquement" })}
                    </Button>
                  </span>
                </TooltipTrigger>
                {!autoEnabled && (
                  <TooltipContent side="top">
                    {t("inbox.detail.autoDisabledReason", {
                      defaultValue: "Soin, variante, date, heure et confiance ≥ 80% requis",
                    })}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        )}

        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-normal">{t("inbox.detail.parsed")}</h3>
              {inquiry.confidence_score !== null && (
                <Badge
                  variant="outline"
                  className={confidenceTone(inquiry.confidence_score).className}
                >
                  {t("inbox.detail.confidence", { defaultValue: "Confidence" })}: {Math.round(inquiry.confidence_score * 100)}%
                </Badge>
              )}
            </div>
            {inquiry.parsed_data
              ? <ParsedSummary parsed={inquiry.parsed_data} t={t} />
              : <p className="text-sm text-muted-foreground italic">{t("inbox.detail.notParsed")}</p>}
          </div>

          {inquiry.status === "converted" && inquiry.booking_id && (
            <ConvertedSection bookingId={inquiry.booking_id} t={t} onNavigate={() => onOpenChange(false)} />
          )}

          {inquiry.error_message && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <div className="text-xs font-semibold text-red-700 uppercase mb-1">
                {t("inbox.detail.errorTitle")}
              </div>
              <p className="text-sm text-red-700">{inquiry.error_message}</p>
            </div>
          )}

          {composerOpen && (
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
          )}

          <div>
            <h3 className="text-sm font-normal mb-2">
              {t("inbox.detail.conversation", { defaultValue: "Conversation" })}
            </h3>
            <InquiryThreadView rootInquiryId={inquiry.id} rootFallback={inquiry} />
          </div>
        </div>

        <Separator className="my-4" />

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("inbox.detail.close")}
          </Button>
        </div>

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
