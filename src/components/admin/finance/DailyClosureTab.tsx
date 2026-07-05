import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
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
import type { TherapistRates } from "@/lib/therapistEarnings";

import {
  computeClosureStats,
  renderClosureReportHtml,
  type ClientTypeValue,
  type ClosureBooking,
  type ClosureReport,
  type ClosureStats,
  type ClosureVenue,
  type TherapistRatesMap,
} from "@/lib/closureReport";

import { ClosureReportPreviewDialog } from "./ClosureReportPreviewDialog";
import { ClosureSendEmailDialog } from "./ClosureSendEmailDialog";

interface VenueOption {
  id: string;
  name: string;
  currency: string | null;
  hotel_commission: number | null;
  venue_type: string | null;
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
  payment_method: string | null;
  payment_status: string | null;
  status: string;
  hotel_id: string;
  booking_treatments?: Array<{
    treatment_menus: { name: string; category: string | null; duration: number | null } | null;
  }> | null;
}

const fmtMoney = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

function normalizeClientType(value: string | null | undefined): ClientTypeValue {
  if (value === "hotel" || value === "staycation" || value === "classpass" || value === "external") {
    return value;
  }
  return "external";
}

export function DailyClosureTab() {
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [date, setDate] = useState<Date>(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [bookings, setBookings] = useState<RawBookingRow[]>([]);
  const [therapistRates, setTherapistRates] = useState<TherapistRatesMap>({});
  const [loading, setLoading] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [hideCommissions, setHideCommissions] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  useEffect(() => {
    supabase
      .from("hotels")
      .select("id, name, currency, hotel_commission, venue_type")
      .eq("status", "active")
      .order("name")
      .then(({ data, error }) => {
        if (error) {
          console.error("[DailyClosureTab] load venues failed", error);
          toast.error("Impossible de charger les lieux");
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
             client_type, room_number, therapist_id, therapist_name, duration,
             total_price, payment_method, payment_status, status, hotel_id,
             booking_treatments ( treatment_menus ( name, category, duration ) )`,
          )
          .eq("hotel_id", selectedVenueId)
          .eq("booking_date", dateIso)
          .order("booking_time", { ascending: true }),
        supabase
          .from("therapist_venues")
          .select("therapist_id, therapists ( id, rate_60, rate_75, rate_90 )")
          .eq("hotel_id", selectedVenueId),
      ]);

      if (bookingsResult.error) throw bookingsResult.error;
      if (ratesResult.error) throw ratesResult.error;

      setBookings((bookingsResult.data ?? []) as RawBookingRow[]);

      const ratesMap: TherapistRatesMap = {};
      for (const row of ratesResult.data ?? []) {
        const t = (row as { therapists: { id: string; rate_60: number | null; rate_75: number | null; rate_90: number | null } | null })
          .therapists;
        if (!t) continue;
        const rates: TherapistRates = { rate_60: t.rate_60, rate_75: t.rate_75, rate_90: t.rate_90 };
        if (rates.rate_60 == null && rates.rate_75 == null && rates.rate_90 == null) {
          ratesMap[t.id] = null;
        } else {
          ratesMap[t.id] = rates;
        }
      }
      setTherapistRates(ratesMap);
    } catch (err) {
      console.error("[DailyClosureTab] fetch failed", err);
      toast.error("Impossible de charger les réservations");
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
        client_type: normalizeClientType(b.client_type),
        room_number: b.room_number,
        therapist_id: b.therapist_id,
        therapist_name: b.therapist_name,
        duration: b.duration,
        total_price: b.total_price,
        payment_method: b.payment_method,
        payment_status: b.payment_status,
        status: b.status,
        treatments:
          b.booking_treatments
            ?.map((bt) => ({
              name: bt.treatment_menus?.name ?? "—",
              category: bt.treatment_menus?.category ?? null,
              duration: bt.treatment_menus?.duration ?? null,
            }))
            .filter((t) => t.name !== "—") ?? [],
      })),
    [bookings],
  );

  const stats: ClosureStats | null = useMemo(() => {
    if (!closureVenue) return null;
    return computeClosureStats(closureBookings, closureVenue, therapistRates);
  }, [closureBookings, closureVenue, therapistRates]);

  const report: ClosureReport | null = useMemo(() => {
    if (!closureVenue || !stats) return null;
    return { venue: closureVenue, date: dateIso, stats, bookings: closureBookings };
  }, [closureVenue, stats, dateIso, closureBookings]);

  const filename = report
    ? `cloture-${report.venue.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${dateIso}${hideCommissions ? "-lieu" : ""}.pdf`
    : "cloture.pdf";
  const subject = report ? `Clôture ${report.venue.name} — ${format(date, "EEEE d MMMM yyyy", { locale: fr })}` : "";

  const handleSendEmail = useCallback(
    async (recipients: string[], includeDetailsFromDialog: boolean) => {
      if (!report) throw new Error("Rapport non disponible");
      const { error } = await invokeEdgeFunction("send-daily-closure-report", {
        body: {
          hotel_id: report.venue.id,
          report_date: report.date,
          recipients,
          include_details: includeDetailsFromDialog,
          hide_commissions: hideCommissions,
        },
      });
      if (error) throw error;
    },
    [report, hideCommissions],
  );

  const currency = closureVenue?.currency ?? "EUR";

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Sélection</CardTitle>
          <CardDescription>Choisissez un lieu et une date pour générer la clôture.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="space-y-1 flex-1">
            <Label className="text-xs text-muted-foreground">Lieu</Label>
            <Select value={selectedVenueId} onValueChange={setSelectedVenueId}>
              <SelectTrigger className="w-full md:w-[260px]">
                <SelectValue placeholder="Choisir un lieu" />
              </SelectTrigger>
              <SelectContent>
                {venues.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full md:w-[220px] justify-start font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(date, "EEEE d MMMM yyyy", { locale: fr })}
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
          </div>

          <div className="flex gap-2 md:ml-auto">
            <Button variant="outline" onClick={fetchData} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
              Rafraîchir
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Headline summary */}
      {report && (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
          <CardContent className="py-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {selectedVenue?.name}
              </p>
              <p className="text-2xl font-semibold mt-1">
                {report.stats.completedBookings} prestation
                {report.stats.completedBookings > 1 ? "s" : ""} · {fmtMoney(report.stats.totalRevenue, currency)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {format(date, "EEEE d MMMM yyyy", { locale: fr })}
              </p>
            </div>
            <div className="flex flex-col md:flex-row gap-2 md:items-center">
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-background/60">
                <EyeOff className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="closure-hide-commissions" className="text-xs cursor-pointer">
                  Masquer commissions
                </Label>
                <Switch
                  id="closure-hide-commissions"
                  checked={hideCommissions}
                  onCheckedChange={setHideCommissions}
                />
              </div>
              <Button variant="outline" onClick={() => setPreviewOpen(true)} disabled={!report}>
                <FileDown className="h-4 w-4 mr-2" />
                Aperçu / PDF
              </Button>
              <Button onClick={() => setSendOpen(true)} disabled={!report}>
                <Mail className="h-4 w-4 mr-2" />
                Envoyer par email
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Warning banner */}
      {report && !hideCommissions && report.stats.bookingsWithoutTherapistRate > 0 && (
        <Card className="border-yellow-300 bg-yellow-50 dark:bg-yellow-900/10">
          <CardContent className="py-3 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0" />
            <p className="text-sm text-yellow-900 dark:text-yellow-200">
              {report.stats.bookingsWithoutTherapistRate} prestation
              {report.stats.bookingsWithoutTherapistRate > 1 ? "s" : ""} sans tarif thérapeute défini —
              part thérapeute calculée à 0 sur ces lignes.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stat tiles */}
      {report && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatTile label="Chiffre d'affaires" value={fmtMoney(report.stats.totalRevenue, currency)} />
            <StatTile label="Total bookings" value={String(report.stats.totalBookings)} />
            <div className="rounded-lg border bg-card p-3 md:col-span-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Statuts</p>
              <p className="text-lg font-semibold mt-1 tabular-nums">
                {report.stats.completedBookings + report.stats.confirmedBookings} actives
              </p>
            </div>
          </div>

          <BookingStatusChart
            completed={report.stats.completedBookings}
            confirmed={report.stats.confirmedBookings}
            pending={report.stats.pendingBookings}
            cancelled={report.stats.cancelledBookings}
            noShow={report.stats.noShowBookings}
            total={report.stats.totalBookings}
          />

          {!hideCommissions && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <StatTile label="Part lieu" value={fmtMoney(report.stats.totalVenueShare, currency)} />
              <StatTile label="Part thérapeute" value={fmtMoney(report.stats.totalTherapistShare, currency)} />
              <StatTile label="Part plateforme" value={fmtMoney(report.stats.totalPlatformShare, currency)} />
            </div>
          )}
        </>
      )}

      {/* Breakdown sections */}
      {report && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BreakdownCard
            title="Par type de prestation"
            empty="Aucune prestation"
            rows={report.stats.byCategory.map((b) => ({
              label: b.label,
              count: b.count,
              value: fmtMoney(b.revenue, currency),
            }))}
          />
          <BreakdownCard
            title="Par type de client"
            empty="Aucune prestation complétée"
            rows={report.stats.byClientType.map((b) => ({
              label: b.label,
              count: b.count,
              value: fmtMoney(b.revenue, currency),
            }))}
          />
          {report.stats.byTherapist.length > 0 && (
            <BreakdownCard
              title="Par thérapeute"
              empty=""
              rows={report.stats.byTherapist.map((b) => ({
                label: b.label,
                count: b.count,
                value: fmtMoney(b.revenue, currency),
                secondary: hideCommissions
                  ? undefined
                  : b.hasRates
                    ? fmtMoney(b.earnings, currency)
                    : "—",
                secondaryWarn: !hideCommissions && !b.hasRates,
              }))}
              secondaryLabel={hideCommissions ? undefined : "Part thér."}
            />
          )}
          {report.stats.byPaymentMethod.length > 0 && (
            <BreakdownCard
              title="Par moyen de paiement"
              empty=""
              rows={report.stats.byPaymentMethod.map((b) => ({
                label: b.label,
                count: b.count,
                value: fmtMoney(b.revenue, currency),
              }))}
            />
          )}
        </div>
      )}

      {/* Detail toggle */}
      {report && report.bookings.length > 0 && (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base font-medium flex items-center gap-2">
                {showDetail ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Détail des prestations ({report.bookings.length})
              </CardTitle>
              <CardDescription>Toutes les réservations du lieu pour la journée.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="closure-toggle-details" className="text-sm cursor-pointer">
                Afficher
              </Label>
              <Switch id="closure-toggle-details" checked={showDetail} onCheckedChange={setShowDetail} />
            </div>
          </CardHeader>
          {showDetail && (
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase text-muted-foreground tracking-wide">
                      <th className="text-left font-medium py-2 pr-3">Heure</th>
                      <th className="text-left font-medium py-2 pr-3">N°</th>
                      <th className="text-left font-medium py-2 pr-3">Client</th>
                      <th className="text-left font-medium py-2 pr-3">Type</th>
                      <th className="text-left font-medium py-2 pr-3">Prestation</th>
                      <th className="text-left font-medium py-2 pr-3">Thérapeute</th>
                      <th className="text-right font-medium py-2 pr-3">Prix</th>
                      <th className="text-left font-medium py-2">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...report.bookings]
                      .sort((a, b) => a.booking_time.localeCompare(b.booking_time))
                      .map((b) => (
                        <tr
                          key={b.id}
                          className="border-b last:border-0 cursor-pointer hover:bg-muted/40 transition-colors"
                          onClick={() => window.open(`/admin/bookings/${b.id}`, "_blank", "noopener,noreferrer")}
                          title="Ouvrir la réservation dans un nouvel onglet"
                        >
                          <td className="py-2 pr-3 tabular-nums">{b.booking_time.slice(0, 5)}</td>
                          <td className="py-2 pr-3 tabular-nums text-muted-foreground">#{b.booking_id}</td>
                          <td className="py-2 pr-3">
                            {b.client_first_name} {b.client_last_name}
                            {b.room_number && (
                              <span className="text-xs text-muted-foreground ml-1">· ch. {b.room_number}</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-xs text-muted-foreground">{b.client_type}</td>
                          <td className="py-2 pr-3">{b.treatments.map((t) => t.name).join(", ") || "—"}</td>
                          <td className="py-2 pr-3">{b.therapist_name ?? "—"}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {b.total_price != null ? fmtMoney(b.total_price, currency) : "—"}
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
            <p>Aucune réservation pour ce lieu à cette date.</p>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      {report && (
        <>
          <ClosureReportPreviewDialog
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            html={renderClosureReportHtml(report, { includeDetails: true, hideCommissions })}
            filename={filename}
            title={subject}
          />
          <ClosureSendEmailDialog
            open={sendOpen}
            onOpenChange={setSendOpen}
            venueId={report.venue.id}
            venueName={report.venue.name}
            defaultSubject={subject}
            defaultIncludeDetails={showDetail}
            onSend={handleSendEmail}
          />
        </>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning" | "danger" | "info";
}) {
  const toneClass =
    tone === "success"
      ? "text-green-600"
      : tone === "warning"
        ? "text-yellow-600"
        : tone === "danger"
          ? "text-red-600"
          : tone === "info"
            ? "text-blue-600"
            : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={cn("text-lg font-semibold mt-1 tabular-nums", toneClass)}>{value}</p>
    </div>
  );
}

function BookingStatusChart({
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
  const segments = [
    { key: "completed", label: "Complétées", count: completed, color: "bg-green-500", dot: "bg-green-500" },
    { key: "confirmed", label: "Confirmées", count: confirmed, color: "bg-blue-500", dot: "bg-blue-500" },
    { key: "pending", label: "En attente", count: pending, color: "bg-yellow-500", dot: "bg-yellow-500" },
    { key: "cancelled", label: "Annulées", count: cancelled, color: "bg-red-500", dot: "bg-red-500" },
    { key: "noshow", label: "No-show", count: noShow, color: "bg-zinc-400", dot: "bg-zinc-400" },
  ];
  const denom = total > 0 ? total : 1;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Statuts des réservations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune réservation</p>
        ) : (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
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
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {segments.map((s) => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className={cn("h-2.5 w-2.5 rounded-full", s.dot)} />
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="font-medium tabular-nums">{s.count}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    ({Math.round((s.count / denom) * 100)}%)
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function BreakdownCard({
  title,
  rows,
  empty,
  secondaryLabel,
}: {
  title: string;
  rows: Array<{
    label: string;
    count: number;
    value: string;
    secondary?: string;
    secondaryWarn?: boolean;
  }>;
  empty: string;
  secondaryLabel?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground flex items-center justify-between">
          <span>{title}</span>
          {secondaryLabel && <span className="text-[10px] normal-case font-normal">{secondaryLabel}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{r.label}</span>
                <div className="flex items-baseline gap-3 shrink-0 tabular-nums">
                  <span className="text-xs text-muted-foreground">{r.count}</span>
                  <span className="font-medium">{r.value}</span>
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
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
