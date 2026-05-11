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
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

import {
  computeClosureStats,
  renderClosureReportHtml,
  type ClosureBooking,
  type ClosureReport,
  type ClosureStats,
  type ClosureVenue,
} from "@/lib/closureReport";

import { ClosureReportPreviewDialog } from "./ClosureReportPreviewDialog";
import { ClosureSendEmailDialog } from "./ClosureSendEmailDialog";

interface VenueOption {
  id: string;
  name: string;
  currency: string | null;
  hotel_commission: number | null;
  therapist_commission: number | null;
  venue_type: string | null;
}

interface RawBookingRow {
  id: string;
  booking_id: number;
  booking_date: string;
  booking_time: string;
  client_first_name: string;
  client_last_name: string;
  room_number: string | null;
  therapist_name: string | null;
  total_price: number | null;
  payment_method: string | null;
  payment_status: string | null;
  status: string;
  hotel_id: string;
  booking_treatments?: Array<{
    treatment_menus: { name: string; category: string | null } | null;
  }> | null;
}

const fmtMoney = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

export function DailyClosureTab() {
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [date, setDate] = useState<Date>(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [bookings, setBookings] = useState<RawBookingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [includeDetails, setIncludeDetails] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  // Load venues once
  useEffect(() => {
    supabase
      .from("hotels")
      .select("id, name, currency, hotel_commission, therapist_commission, venue_type")
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

  const fetchBookings = useCallback(async () => {
    if (!selectedVenueId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          `id, booking_id, booking_date, booking_time, client_first_name, client_last_name,
           room_number, therapist_name, total_price, payment_method, payment_status, status, hotel_id,
           booking_treatments ( treatment_menus ( name, category ) )`,
        )
        .eq("hotel_id", selectedVenueId)
        .eq("booking_date", dateIso)
        .order("booking_time", { ascending: true });

      if (error) throw error;
      setBookings((data ?? []) as RawBookingRow[]);
    } catch (err) {
      console.error("[DailyClosureTab] fetch bookings failed", err);
      toast.error("Impossible de charger les réservations");
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [selectedVenueId, dateIso]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const closureVenue: ClosureVenue | null = useMemo(() => {
    if (!selectedVenue) return null;
    return {
      id: selectedVenue.id,
      name: selectedVenue.name,
      currency: selectedVenue.currency ?? "EUR",
      hotel_commission: Number(selectedVenue.hotel_commission ?? 0),
      therapist_commission: Number(selectedVenue.therapist_commission ?? 0),
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
        room_number: b.room_number,
        therapist_name: b.therapist_name,
        total_price: b.total_price,
        payment_method: b.payment_method,
        payment_status: b.payment_status,
        status: b.status,
        treatments:
          b.booking_treatments
            ?.map((bt) => ({
              name: bt.treatment_menus?.name ?? "—",
              category: bt.treatment_menus?.category ?? null,
            }))
            .filter((t) => t.name !== "—") ?? [],
      })),
    [bookings],
  );

  const stats: ClosureStats | null = useMemo(() => {
    if (!closureVenue) return null;
    return computeClosureStats(closureBookings, closureVenue);
  }, [closureBookings, closureVenue]);

  const report: ClosureReport | null = useMemo(() => {
    if (!closureVenue || !stats) return null;
    return { venue: closureVenue, date: dateIso, stats, bookings: closureBookings };
  }, [closureVenue, stats, dateIso, closureBookings]);

  const filename = report
    ? `cloture-${report.venue.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${dateIso}.pdf`
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
        },
      });
      if (error) throw error;
    },
    [report],
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
            <Label className="text-xs text-muted-foreground">Date</Label>
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
            <Button variant="outline" onClick={fetchBookings} disabled={loading}>
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
            <div className="flex gap-2">
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

      {/* Stat tiles */}
      {report && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label="Chiffre d'affaires" value={fmtMoney(report.stats.totalRevenue, currency)} />
          <StatTile label="Part lieu" value={fmtMoney(report.stats.totalVenueShare, currency)} />
          <StatTile label="Part thérapeute" value={fmtMoney(report.stats.totalTherapistShare, currency)} />
          <StatTile label="Part plateforme" value={fmtMoney(report.stats.totalPlatformShare, currency)} />
          <StatTile label="Complétées" value={String(report.stats.completedBookings)} tone="success" />
          <StatTile label="En attente" value={String(report.stats.pendingBookings)} tone="warning" />
          <StatTile label="Annulées" value={String(report.stats.cancelledBookings)} tone="danger" />
          <StatTile label="No-show" value={String(report.stats.noShowBookings)} tone="danger" />
        </div>
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
            empty="—"
            rows={[
              {
                label:
                  selectedVenue?.venue_type === "hotel"
                    ? "Résidents (avec n° chambre)"
                    : "Clients sur place",
                count: report.stats.byClientType.internal.count,
                value: fmtMoney(report.stats.byClientType.internal.revenue, currency),
              },
              {
                label: "Clients externes",
                count: report.stats.byClientType.external.count,
                value: fmtMoney(report.stats.byClientType.external.revenue, currency),
              },
            ]}
          />
          {report.stats.byTherapist.length > 0 && (
            <BreakdownCard
              title="Par thérapeute"
              empty=""
              rows={report.stats.byTherapist.map((b) => ({
                label: b.label,
                count: b.count,
                value: fmtMoney(b.revenue, currency),
              }))}
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
                {includeDetails ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Détail des prestations ({report.bookings.length})
              </CardTitle>
              <CardDescription>Toutes les réservations du lieu pour la journée.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="closure-toggle-details" className="text-sm cursor-pointer">
                Afficher
              </Label>
              <Switch id="closure-toggle-details" checked={includeDetails} onCheckedChange={setIncludeDetails} />
            </div>
          </CardHeader>
          {includeDetails && (
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase text-muted-foreground tracking-wide">
                      <th className="text-left font-medium py-2 pr-3">Heure</th>
                      <th className="text-left font-medium py-2 pr-3">N°</th>
                      <th className="text-left font-medium py-2 pr-3">Client</th>
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
                        <tr key={b.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 tabular-nums">{b.booking_time.slice(0, 5)}</td>
                          <td className="py-2 pr-3 tabular-nums text-muted-foreground">#{b.booking_id}</td>
                          <td className="py-2 pr-3">
                            {b.client_first_name} {b.client_last_name}
                            {b.room_number && (
                              <span className="text-xs text-muted-foreground ml-1">· ch. {b.room_number}</span>
                            )}
                          </td>
                          <td className="py-2 pr-3">{b.treatments.map((t) => t.name).join(", ") || "—"}</td>
                          <td className="py-2 pr-3">{b.therapist_name ?? "—"}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {b.total_price != null ? fmtMoney(b.total_price, currency) : "—"}
                          </td>
                          <td className="py-2">
                            <Badge variant="outline" className="text-xs font-normal">
                              {b.status}
                            </Badge>
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
            html={renderClosureReportHtml(report, { includeDetails: true })}
            filename={filename}
            title={subject}
          />
          <ClosureSendEmailDialog
            open={sendOpen}
            onOpenChange={setSendOpen}
            venueId={report.venue.id}
            venueName={report.venue.name}
            defaultSubject={subject}
            defaultIncludeDetails={includeDetails}
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
  tone?: "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-green-600"
      : tone === "warning"
        ? "text-yellow-600"
        : tone === "danger"
          ? "text-red-600"
          : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={cn("text-lg font-semibold mt-1 tabular-nums", toneClass)}>{value}</p>
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: Array<{ label: string; count: number; value: string }>;
  empty: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {title}
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
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
