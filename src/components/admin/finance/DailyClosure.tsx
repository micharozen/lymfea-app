import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { useDateLocale } from "@/lib/dateLocale";
import {
  CalendarIcon,
  Building2,
  RefreshCw,
  FileDown,
  Mail,
  Loader2,
  ChevronRight,
  ChevronDown,
  EyeOff,
  AlertTriangle,
  Clock,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import type { TherapistRates, TreatmentRateMap } from "@/lib/therapistEarnings";

import {
  CLIENT_TYPE_COLORS,
  CLIENT_TYPE_LABELS,
  closurePaymentLabel,
  closureRoomNumber,
  closureTherapistNames,
  computeClosureStats,
  fmtPercent,
  renderClosureReportHtml,
  type ClosureBooking,
  type ClosureReport,
  type ClosureStats,
  type ClosureVenue,
  type TherapistRatesMap,
  type TherapistTreatmentRatesMap,
} from "@/lib/closureReport";
import { orderRoster } from "@/lib/closureTherapistSplit";
import { resolveTreatmentPrice } from "@/lib/treatmentPrice";
import { normalizeBookingClientType } from "@/lib/clientTypeMeta";

import { ClosureReportPreviewDialog } from "./ClosureReportPreviewDialog";
import { ClosureSendEmailDialog } from "./ClosureSendEmailDialog";

interface VenueOption {
  id: string;
  name: string;
  image: string | null;
  currency: string | null;
  hotel_commission: number | null;
  venue_type: string | null;
  out_of_hours_surcharge_percent: number | null;
  organizations: { name: string | null; commercial_name: string | null } | null;
}

interface RawBookingRow {
  id: string;
  booking_id: number;
  booking_date: string;
  booking_time: string;
  client_first_name: string;
  client_last_name: string;
  client_type: string;
  room_number: string | null;
  therapist_id: string | null;
  therapist_name: string | null;
  duration: number | null;
  total_price: number | null;
  is_out_of_hours: boolean | null;
  payment_method: string | null;
  payment_status: string | null;
  status: string;
  hotel_id: string;
  guest_count: number | null;
  booking_treatments?: Array<{
    therapist_id: string | null;
    treatment_id: string | null;
    is_addon: boolean | null;
    price_override: number | null;
    treatment_menus: {
      name: string;
      category: string | null;
      duration: number | null;
      price: number | null;
    } | null;
    treatment_variants: { duration: number | null; price: number | null } | null;
  }> | null;
  booking_therapists?: Array<{
    therapist_id: string;
    status: string | null;
    assigned_at: string | null;
  }> | null;
}

/**
 * Nom de fichier : les accents sont translittérés avant le filtrage. Sans la
 * décomposition NFD, « Hôtel » perdait son ô et devenait « h-tel ».
 */
const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

const fmtMoney = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

export function DailyClosure() {
  const { t } = useTranslation(['admin', 'common']);
  const dateLocale = useDateLocale();
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [date, setDate] = useState<Date>(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [bookings, setBookings] = useState<RawBookingRow[]>([]);
  const [therapistRates, setTherapistRates] = useState<TherapistRatesMap>({});
  const [therapistTreatmentRates, setTherapistTreatmentRates] =
    useState<TherapistTreatmentRatesMap>({});
  const [therapistNames, setTherapistNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [hideCommissions, setHideCommissions] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  // Projection : compter les résas encore confirmées (soin pas terminé, ou cron
  // de complétion pas encore passé) dans les totaux. N'écrit rien en base.
  const [includeUnfinalized, setIncludeUnfinalized] = useState(false);

  useEffect(() => {
    supabase
      .from("hotels")
      .select("id, name, image, currency, hotel_commission, venue_type, out_of_hours_surcharge_percent, organizations ( name, commercial_name )")
      .eq("status", "active")
      .order("name")
      .then(({ data, error }) => {
        if (error) {
          console.error("[DailyClosure] load venues failed", error);
          toast.error(t('finance.closure.loadVenuesError'));
          return;
        }
        const list = (data ?? []) as VenueOption[];
        setVenues(list);
        if (list.length && !selectedVenueId) {
          setSelectedVenueId(list[0].id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dateIso = useMemo(() => format(date, "yyyy-MM-dd"), [date]);
  const selectedVenue = venues.find((v) => v.id === selectedVenueId);

  const fetchData = useCallback(async () => {
    if (!selectedVenueId) return;
    setLoading(true);
    try {
      const [bookingsResult, ratesResult] = await Promise.all([
        supabase
          .from("bookings")
          .select(
            `id, booking_id, booking_date, booking_time, client_first_name, client_last_name,
             client_type, room_number, therapist_id, therapist_name, duration, guest_count,
             total_price, is_out_of_hours, payment_method, payment_status, status, hotel_id,
             booking_treatments (
               therapist_id, treatment_id, is_addon, price_override,
               treatment_menus ( name, category, duration, price ),
               treatment_variants ( duration, price )
             ),
             booking_therapists ( therapist_id, status, assigned_at )`,
          )
          .eq("hotel_id", selectedVenueId)
          .eq("booking_date", dateIso)
          .order("booking_time", { ascending: true }),
        supabase
          .from("therapist_venues")
          .select(
            "therapist_id, therapists ( id, first_name, last_name, rate_45, rate_60, rate_75, rate_90, rate_105, rate_120, rate_150, treatment_rates, treatment_rates_active )",
          )
          .eq("hotel_id", selectedVenueId),
      ]);

      if (bookingsResult.error) throw bookingsResult.error;
      if (ratesResult.error) throw ratesResult.error;

      setBookings((bookingsResult.data ?? []) as RawBookingRow[]);

      const ratesMap: TherapistRatesMap = {};
      // Le flag est honoré ici : le moteur ne reçoit jamais une map inactive.
      const treatmentRatesMap: TherapistTreatmentRatesMap = {};
      // Noms des thérapeutes du lieu : seule source pour nommer le binôme d'un
      // duo, `bookings.therapist_name` ne connaissant que le principal.
      const names: Record<string, string> = {};
      for (const row of ratesResult.data ?? []) {
        const t = (row as {
          therapists: {
            id: string;
            first_name: string | null;
            last_name: string | null;
            rate_45: number | null;
            rate_60: number | null;
            rate_75: number | null;
            rate_90: number | null;
            rate_105: number | null;
            rate_120: number | null;
            rate_150: number | null;
            treatment_rates: TreatmentRateMap | null;
            treatment_rates_active: boolean | null;
          } | null;
        }).therapists;
        if (!t) continue;
        const rates: TherapistRates = {
          rate_45: t.rate_45,
          rate_60: t.rate_60,
          rate_75: t.rate_75,
          rate_90: t.rate_90,
          rate_105: t.rate_105,
          rate_120: t.rate_120,
          rate_150: t.rate_150,
        };
        if (rates.rate_60 == null && rates.rate_75 == null && rates.rate_90 == null) {
          ratesMap[t.id] = null;
        } else {
          ratesMap[t.id] = rates;
        }
        treatmentRatesMap[t.id] = t.treatment_rates_active ? t.treatment_rates ?? null : null;
        const fullName = `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim();
        if (fullName) names[t.id] = fullName;
      }
      setTherapistRates(ratesMap);
      setTherapistTreatmentRates(treatmentRatesMap);
      setTherapistNames(names);
    } catch (err) {
      console.error("[DailyClosure] fetch failed", err);
      toast.error(t('finance.closure.loadBookingsError'));
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [selectedVenueId, dateIso]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const closureVenue: ClosureVenue | null = useMemo(() => {
    if (!selectedVenue) return null;
    return {
      id: selectedVenue.id,
      name: selectedVenue.name,
      currency: selectedVenue.currency ?? "EUR",
      hotel_commission: Number(selectedVenue.hotel_commission ?? 0),
      venue_type: selectedVenue.venue_type,
      out_of_hours_surcharge_percent: selectedVenue.out_of_hours_surcharge_percent,
      organization_name:
        selectedVenue.organizations?.commercial_name?.trim() ||
        selectedVenue.organizations?.name?.trim() ||
        null,
    };
  }, [selectedVenue]);

  const closureBookings: ClosureBooking[] = useMemo(
    () =>
      bookings.map((b) => ({
        id: b.id,
        booking_id: b.booking_id,
        booking_date: b.booking_date,
        booking_time: b.booking_time,
        client_first_name: b.client_first_name,
        client_last_name: b.client_last_name,
        client_type: normalizeBookingClientType(b.client_type),
        room_number: b.room_number,
        therapist_id: b.therapist_id,
        therapist_name: b.therapist_name,
        duration: b.duration,
        total_price: b.total_price,
        is_out_of_hours: b.is_out_of_hours,
        payment_method: b.payment_method,
        payment_status: b.payment_status,
        status: b.status,
        guest_count: b.guest_count,
        therapists: orderRoster(
          (b.booking_therapists ?? []).filter((r) => r.status === "accepted"),
        ).map((id) => ({ id, name: therapistNames[id] ?? "" })),
        // Toutes les lignes sont conservées : une ligne sans soin lisible porte
        // quand même un prix et un thérapeute, dont la répartition en duo a
        // besoin. C'est le rendu du détail qui écarte les noms manquants.
        treatments:
          b.booking_treatments?.map((bt) => ({
            name: bt.treatment_menus?.name ?? "—",
            category: bt.treatment_menus?.category ?? null,
            duration: bt.treatment_variants?.duration ?? bt.treatment_menus?.duration ?? null,
            therapist_id: bt.therapist_id,
            is_addon: bt.is_addon,
            price: resolveTreatmentPrice(bt),
            treatment_id: bt.treatment_id ?? null,
          })) ?? [],
      })),
    [bookings, therapistNames],
  );

  const stats: ClosureStats | null = useMemo(() => {
    if (!closureVenue) return null;
    return computeClosureStats(closureBookings, closureVenue, therapistRates, {
      includeUnfinalized,
      therapistTreatmentRates,
    });
  }, [closureBookings, closureVenue, therapistRates, therapistTreatmentRates, includeUnfinalized]);

  const report: ClosureReport | null = useMemo(() => {
    if (!closureVenue || !stats) return null;
    return { venue: closureVenue, date: dateIso, stats, bookings: closureBookings };
  }, [closureVenue, stats, dateIso, closureBookings]);

  const filename = report
    ? `cloture-${slugify(report.venue.name)}-${dateIso}${hideCommissions ? "-lieu" : ""}.pdf`
    : "cloture.pdf";
  const subject = report ? `Clôture ${report.venue.name} — ${format(date, "EEEE d MMMM yyyy", { locale: dateLocale })}` : "";

  const handleSendEmail = useCallback(
    async (recipients: string[], includeDetailsFromDialog: boolean) => {
      if (!report) throw new Error(t('finance.closure.reportUnavailable'));
      const { error } = await invokeEdgeFunction("send-daily-closure-report", {
        body: {
          hotel_id: report.venue.id,
          report_date: report.date,
          recipients,
          include_details: includeDetailsFromDialog,
          hide_commissions: hideCommissions,
          include_unfinalized: includeUnfinalized,
        },
      });
      if (error) throw error;
    },
    [report, hideCommissions, includeUnfinalized],
  );

  const currency = closureVenue?.currency ?? "EUR";

  // Ouvrir le détail amène sa carte en haut de l'écran : sans cela le tableau
  // se déplie hors du champ de vision et impose un défilement manuel.
  const detailRef = useRef<HTMLDivElement>(null);
  const toggleDetail = useCallback(() => {
    setShowDetail((open) => !open);
    if (showDetail) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({
        behavior: smooth ? "smooth" : "auto",
        block: "start",
      });
    });
  }, [showDetail]);
  // Journée vide : un seul état vide, pas une bande de zéros suivie de panneaux
  // vides. Tout ce qui commente des chiffres attend qu'il y ait des chiffres.
  const dayReport = report && report.bookings.length > 0 ? report : null;

  return (
    <div className="space-y-6">
      {/* En-tête : le lieu et la date pilotent tout le contenu de la page, ils
          restent donc au-dessus de ce qu'ils pilotent, avec les deux sorties. */}
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-medium text-foreground">{t('finance.page.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('finance.page.subtitle')}</p>
        </div>

        {/* Une seule ligne : les deux entrées à gauche, les deux sorties à
            droite. Sur écran étroit la barre défile plutôt que de se casser. */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Select value={selectedVenueId} onValueChange={setSelectedVenueId}>
            <SelectTrigger className="w-[220px] shrink-0">
              <SelectValue placeholder={t('finance.closure.chooseVenue')} />
            </SelectTrigger>
            <SelectContent>
              {venues.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  <span className="flex items-center gap-2">
                    <VenueAvatar name={v.name} image={v.image} />
                    <span className="truncate">{v.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="shrink-0 font-normal whitespace-nowrap">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(date, "EEEE d MMMM yyyy", { locale: dateLocale })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => {
                  if (d) {
                    setDate(d);
                    setDatePickerOpen(false);
                  }
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={fetchData}
            disabled={loading}
            title={t('finance.closure.refresh')}
            aria-label={t('finance.closure.refresh')}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>

          <div className="ml-auto flex shrink-0 items-center gap-2 pl-4">
            <Button
              variant="outline"
              className="whitespace-nowrap"
              onClick={() => setPreviewOpen(true)}
              disabled={!dayReport}
            >
              <FileDown className="h-4 w-4 mr-2" />
              {t('finance.closure.previewPdf')}
            </Button>

            <Button
              className="whitespace-nowrap"
              onClick={() => setSendOpen(true)}
              disabled={!dayReport}
            >
              <Mail className="h-4 w-4 mr-2" />
              {t('finance.closure.sendByEmail')}
            </Button>
          </div>
        </div>
      </div>

      {/* Alertes : ce qui change la lecture des chiffres passe avant les chiffres. */}
      {dayReport && dayReport.stats.confirmedBookings > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-900/10">
          <Clock className="h-4 w-4 text-blue-600 shrink-0" />
          <p className="text-sm text-blue-900 dark:text-blue-200 flex-1">
            {t('finance.closure.unfinalizedNotice', {
              count: dayReport.stats.confirmedBookings,
              amount: fmtMoney(dayReport.stats.unfinalizedRevenue, currency),
            })}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Label htmlFor="closure-include-unfinalized" className="text-xs cursor-pointer">
              {t('finance.closure.includeUnfinalized')}
            </Label>
            <Switch
              id="closure-include-unfinalized"
              checked={includeUnfinalized}
              onCheckedChange={setIncludeUnfinalized}
            />
          </div>
        </div>
      )}

      {dayReport && !hideCommissions && dayReport.stats.bookingsWithoutTherapistRate > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 dark:border-yellow-900 dark:bg-yellow-900/10">
          <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
          <p className="text-sm text-yellow-900 dark:text-yellow-200">
            {dayReport.stats.bookingsWithoutTherapistRate} prestation
            {dayReport.stats.bookingsWithoutTherapistRate > 1 ? "s" : ""} sans tarif thérapeute défini —
            part thérapeute calculée à 0 sur ces lignes.
          </p>
        </div>
      )}

      {/* Bande du jour : un seul chiffre lu en premier, le reste le nuance. */}
      {dayReport && (
        <Card>
          <CardContent className="py-6 space-y-6">
            <div className="flex flex-col gap-6 md:flex-row md:items-end">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('finance.closure.revenueBooked')}
                </p>
                <p className="mt-1 text-4xl leading-none tabular-nums">
                  {fmtMoney(dayReport.stats.totalRevenue, currency)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('finance.closure.countedOf', {
                    counted: dayReport.stats.countedBookings,
                    total: dayReport.stats.totalBookings,
                  })}
                </p>
              </div>

              <div className="flex flex-wrap md:ml-auto">
                <Stat
                  label={t('finance.closure.averageTicket')}
                  value={fmtMoney(
                    dayReport.stats.countedBookings > 0
                      ? dayReport.stats.totalRevenue / dayReport.stats.countedBookings
                      : 0,
                    currency,
                  )}
                />
                <Stat
                  label={t('finance.closure.completionRate')}
                  value={fmtPercent(
                    dayReport.stats.totalBookings > 0
                      ? (dayReport.stats.countedBookings / dayReport.stats.totalBookings) * 100
                      : 0,
                  )}
                  hint={t('finance.closure.completionRateHint', {
                    counted: dayReport.stats.countedBookings,
                    total: dayReport.stats.totalBookings,
                  })}
                />
              </div>
            </div>

            {/* Trois parts d'un même tout : une barre, pas trois cartes. */}
            <div className="space-y-3 border-t pt-5">
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('finance.closure.splitTitle')}
                </p>
                <div className="flex items-center gap-2">
                  <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label htmlFor="closure-hide-commissions" className="text-xs cursor-pointer">
                    {t('finance.closure.hideCommissions')}
                  </Label>
                  <Switch
                    id="closure-hide-commissions"
                    checked={hideCommissions}
                    onCheckedChange={setHideCommissions}
                  />
                </div>
              </div>
              {hideCommissions ? (
                <p className="text-sm text-muted-foreground">
                  {t('finance.closure.commissionsHidden')}
                </p>
              ) : (
                <RevenueSplit
                  venueShare={dayReport.stats.totalVenueShare}
                  therapistShare={dayReport.stats.totalTherapistShare}
                  platformShare={dayReport.stats.totalPlatformShare}
                  currency={currency}
                />
              )}
            </div>

            <div className="space-y-3 border-t pt-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('finance.closure.dayStatuses')}
              </p>
              <BookingStatusStrip
                completed={dayReport.stats.completedBookings}
                confirmed={dayReport.stats.confirmedBookings}
                pending={dayReport.stats.pendingBookings}
                cancelled={dayReport.stats.cancelledBookings}
                noShow={dayReport.stats.noShowBookings}
                total={dayReport.stats.totalBookings}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Répartitions : les quatre angles de lecture du même chiffre du jour.
          Chaque ligne porte sa part, pour qu'un total se lise sans calcul. */}
      {dayReport && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BreakdownCard
            showShare
            title={t('finance.closure.byCategory')}
            empty={t('finance.closure.noTreatment')}
            rows={withShare(dayReport.stats.byCategory).map((b) => ({
              label: b.label,
              count: b.count,
              value: fmtMoney(b.revenue, currency),
              share: b.share,
            }))}
          />
          <BreakdownCard
            showShare
            title={t('finance.closure.byClientType')}
            empty={t('finance.closure.noCompletedTreatment')}
            rows={dayReport.stats.byClientType.map((b) => ({
              label: b.label,
              count: b.count,
              value: fmtMoney(b.revenue, currency),
              share: b.sharePercent,
              color: CLIENT_TYPE_COLORS[b.key],
            }))}
          />
          {dayReport.stats.byTherapist.length > 0 && (
            <BreakdownCard
              title={t('finance.closure.byTherapist')}
              empty=""
              rows={withShare(dayReport.stats.byTherapist).map((b) => ({
                label: b.label,
                count: b.count,
                value: fmtMoney(b.revenue, currency),
                share: b.share,
                secondary: hideCommissions
                  ? undefined
                  : b.hasRates
                    ? fmtMoney(b.earnings, currency)
                    : "—",
                secondaryWarn: !hideCommissions && !b.hasRates,
              }))}
              secondaryLabel={hideCommissions ? undefined : t('finance.closure.therapistShareShort')}
            />
          )}
          {dayReport.stats.byPaymentMethod.length > 0 && (
            <BreakdownCard
              showShare
              title={t('finance.closure.byPaymentMethod')}
              empty=""
              rows={withShare(dayReport.stats.byPaymentMethod).map((b) => ({
                label: b.label,
                count: b.count,
                value: fmtMoney(b.revenue, currency),
                share: b.share,
              }))}
            />
          )}
        </div>
      )}

      {/* Détail : l'en-tête est la commande, le chevron dit dans quel sens. */}
      {dayReport && (
        <Card ref={detailRef} className="scroll-mt-4">
          <CardHeader
            role="button"
            tabIndex={0}
            aria-expanded={showDetail}
            aria-controls="closure-detail-panel"
            onClick={toggleDetail}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleDetail();
              }
            }}
            className="pb-3 cursor-pointer select-none rounded-t-lg transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CardTitle className="text-base font-medium flex items-center gap-2">
              {showDetail ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {t('finance.closure.detailTitle', { count: dayReport.bookings.length })}
            </CardTitle>
            <CardDescription>{t('finance.closure.detailDesc')}</CardDescription>
          </CardHeader>
          {showDetail && (
            <CardContent id="closure-detail-panel">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase text-muted-foreground tracking-wide">
                      <th className="text-left font-medium py-2 pr-3">{t('finance.closure.colNumber')}</th>
                      <th className="text-left font-medium py-2 pr-3">{t('finance.closure.colClient')}</th>
                      <th className="text-left font-medium py-2 pr-3">{t('finance.closure.colRoom')}</th>
                      <th className="text-left font-medium py-2 pr-3">{t('finance.closure.colType')}</th>
                      <th className="text-left font-medium py-2 pr-3">{t('finance.closure.colTreatment')}</th>
                      <th className="text-left font-medium py-2 pr-3">{t('finance.closure.colTherapist')}</th>
                      <th className="text-right font-medium py-2 pr-3">{t('finance.closure.colPrice')}</th>
                      <th className="text-left font-medium py-2 pr-3">{t('finance.closure.colPayment')}</th>
                      <th className="text-left font-medium py-2">{t('finance.closure.colStatus')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...dayReport.bookings]
                      .sort((a, b) => a.booking_time.localeCompare(b.booking_time))
                      .map((b) => (
                        <tr
                          key={b.id}
                          className="border-b last:border-0 cursor-pointer hover:bg-muted/40 transition-colors"
                          onClick={() => window.open(`/admin/bookings/${b.id}`, "_blank", "noopener,noreferrer")}
                          title={t('finance.closure.openBooking')}
                        >
                          <td className="py-2 pr-3 tabular-nums text-muted-foreground">#{b.booking_id}</td>
                          <td className="py-2 pr-3">
                            {b.client_first_name} {b.client_last_name}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">{closureRoomNumber(b)}</td>
                          <td className="py-2 pr-3 text-xs text-muted-foreground">
                            {CLIENT_TYPE_LABELS[b.client_type]}
                          </td>
                          <td className="py-2 pr-3">
                            {b.treatments
                              .map((t) => t.name)
                              .filter((name) => name && name !== "—")
                              .join(", ") || "—"}
                          </td>
                          <td className="py-2 pr-3">{closureTherapistNames(b)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {b.total_price != null ? fmtMoney(b.total_price, currency) : "—"}
                          </td>
                          <td className="py-2 pr-3 text-xs text-muted-foreground">
                            {closurePaymentLabel(b.payment_method, b.payment_status)}
                          </td>
                          <td className="py-2">
                            <StatusBadge status={b.status} type="booking" />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Loading / empty */}
      {loading && !report && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {!loading && report && report.bookings.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>{t('finance.closure.noBooking')}</p>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      {dayReport && (
        <>
          <ClosureReportPreviewDialog
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            html={renderClosureReportHtml(dayReport, { includeDetails: true, hideCommissions })}
            filename={filename}
            title={subject}
          />
          <ClosureSendEmailDialog
            open={sendOpen}
            onOpenChange={setSendOpen}
            venueId={dayReport.venue.id}
            venueName={dayReport.venue.name}
            defaultSubject={subject}
            defaultIncludeDetails={showDetail}
            onSend={handleSendEmail}
          />
        </>
      )}
    </div>
  );
}

/** Vignette du lieu : sa photo, ou son initiale quand il n'en a pas. */
function VenueAvatar({ name, image }: { name: string; image: string | null }) {
  return (
    <span className="h-5 w-5 shrink-0 overflow-hidden rounded bg-muted flex items-center justify-center">
      {image ? (
        <img src={image} alt="" className="h-full w-full object-cover" />
      ) : (
        <Building2 className="h-3 w-3 text-muted-foreground" />
      )}
    </span>
  );
}

/** Ajoute à chaque tranche sa part du total, pour la barre de proportion. */
function withShare<T extends { revenue: number }>(buckets: T[]): Array<T & { share: number }> {
  const total = buckets.reduce((sum, b) => sum + b.revenue, 0);
  return buckets.map((b) => ({ ...b, share: total > 0 ? (b.revenue / total) * 100 : 0 }));
}

/** Statistique secondaire du bandeau : séparée par un filet, jamais encadrée. */
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-5 first:pl-0 border-l first:border-l-0">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{hint}</p>}
    </div>
  );
}

function RevenueSplit({
  venueShare,
  therapistShare,
  platformShare,
  currency,
}: {
  venueShare: number;
  therapistShare: number;
  platformShare: number;
  currency: string;
}) {
  const { t } = useTranslation('admin');
  const parts = [
    { key: "venue", label: t('finance.closure.venueShare'), amount: venueShare, bar: "bg-primary", dot: "bg-primary" },
    { key: "therapist", label: t('finance.closure.therapistShare'), amount: therapistShare, bar: "bg-primary/50", dot: "bg-primary/50" },
    { key: "platform", label: t('finance.closure.platformShare'), amount: platformShare, bar: "bg-primary/20", dot: "bg-primary/20" },
  ];
  const total = parts.reduce((sum, p) => sum + p.amount, 0);

  if (total <= 0) {
    return <p className="text-sm text-muted-foreground">{t('finance.closure.noCompletedTreatment')}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {parts
          .filter((p) => p.amount > 0)
          .map((p) => (
            <div
              key={p.key}
              className={cn("h-full", p.bar)}
              style={{ width: `${(p.amount / total) * 100}%` }}
              title={`${p.label} : ${fmtMoney(p.amount, currency)}`}
            />
          ))}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {parts.map((p) => (
          <div key={p.key} className="flex items-baseline gap-2">
            <span className={cn("h-2 w-2 rounded-sm shrink-0 self-center", p.dot)} />
            <span className="text-muted-foreground">{p.label}</span>
            <span className="tabular-nums">{fmtMoney(p.amount, currency)}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {fmtPercent((p.amount / total) * 100)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BookingStatusStrip({
  completed,
  confirmed,
  pending,
  cancelled,
  noShow,
  total,
}: {
  completed: number;
  confirmed: number;
  pending: number;
  cancelled: number;
  noShow: number;
  total: number;
}) {
  const { t } = useTranslation('admin');
  const segments = [
    { key: "completed", count: completed, color: "bg-green-500", dot: "bg-green-500" },
    { key: "confirmed", count: confirmed, color: "bg-blue-500", dot: "bg-blue-500" },
    { key: "pending", count: pending, color: "bg-yellow-500", dot: "bg-yellow-500" },
    { key: "cancelled", count: cancelled, color: "bg-red-500", dot: "bg-red-500" },
    { key: "noshow", count: noShow, color: "bg-zinc-400", dot: "bg-zinc-400" },
  ].map((s) => ({ ...s, label: t(`finance.closure.segments.${s.key}`) }));
  const denom = total > 0 ? total : 1;

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">{t('finance.closure.noBookingShort')}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <div
              key={s.key}
              className={cn("h-full", s.color)}
              style={{ width: `${(s.count / denom) * 100}%` }}
              title={`${s.label}: ${s.count}`}
            />
          ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <span
              key={s.key}
              className="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
              {s.label}
              <span className="tabular-nums text-foreground">{s.count}</span>
            </span>
          ))}
      </div>
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
  empty,
  secondaryLabel,
  showShare,
}: {
  title: string;
  rows: Array<{
    label: string;
    count: number;
    value: string;
    /** Part du total de la répartition, en pourcentage. */
    share?: number;
    /** Couleur de la barre de part, quand la catégorie en porte une. */
    color?: string;
    secondary?: string;
    secondaryWarn?: boolean;
  }>;
  empty: string;
  secondaryLabel?: string;
  /** Affiche la part en pourcentage à côté du montant. */
  showShare?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between gap-3">
          <span>{title}</span>
          {secondaryLabel && (
            <span className="text-xs font-normal text-muted-foreground">{secondaryLabel}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.label} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">
                    {r.label}
                    <span className="ml-2 text-xs text-muted-foreground tabular-nums">{r.count}</span>
                  </span>
                  <div className="flex items-baseline gap-3 shrink-0 tabular-nums">
                    <span>{r.value}</span>
                    {showShare && r.share !== undefined && (
                      <span className="text-xs text-muted-foreground">{fmtPercent(r.share)}</span>
                    )}
                    {r.secondary !== undefined && (
                      <span
                        className={cn(
                          "text-xs",
                          r.secondaryWarn ? "text-red-600" : "text-muted-foreground",
                        )}
                      >
                        {r.secondary}
                      </span>
                    )}
                  </div>
                </div>
                {r.share !== undefined && (
                  <div className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", !r.color && "bg-primary/60")}
                      style={{
                        width: `${Math.min(100, Math.max(0, r.share))}%`,
                        ...(r.color ? { backgroundColor: r.color } : {}),
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
