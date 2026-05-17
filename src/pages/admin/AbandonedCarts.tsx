import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, X, ShoppingCart, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/table/TableSkeleton";
import { TableEmptyState } from "@/components/table/TableEmptyState";
import { format } from "date-fns";

type StatusFilter = "active" | "recovered" | "dismissed" | "all";

interface AbandonedCartRow {
  id: string;
  hotel_id: string;
  cart_items: Array<{
    treatmentId: string;
    variantId?: string | null;
    quantity?: number;
    date?: string;
    time?: string;
  }>;
  schedule_mode: "single" | "per_item";
  booking_date: string | null;
  booking_time: string | null;
  is_multi: boolean;
  total_price: number;
  language: string;
  created_at: string;
  recovered_at: string | null;
  recovered_booking_id: string | null;
  reminder_count: number;
  last_reminder_at: string | null;
  dismissed_at: string | null;
  customers: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
  hotels: {
    id: string;
    name: string;
  } | null;
}

export default function AbandonedCarts() {
  const { t } = useTranslation("admin");
  const [rows, setRows] = useState<AbandonedCartRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [hotelFilter, setHotelFilter] = useState<string>("all");
  const [hotels, setHotels] = useState<Array<{ id: string; name: string }>>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [treatmentNames, setTreatmentNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    fetchData();
    fetchHotels();
  }, [statusFilter, hotelFilter]);

  const fetchHotels = async () => {
    const { data } = await supabase.from("hotels").select("id, name").order("name");
    if (data) setHotels(data);
  };

  const fetchData = async () => {
    setLoading(true);
    let query = supabase
      .from("abandoned_carts")
      .select(`
        id, hotel_id, cart_items, schedule_mode, booking_date, booking_time,
        is_multi, total_price, language, created_at, recovered_at,
        recovered_booking_id, reminder_count, last_reminder_at, dismissed_at,
        customers ( id, first_name, last_name, email ),
        hotels ( id, name )
      `)
      .order("created_at", { ascending: false })
      .limit(200);

    if (statusFilter === "active") {
      query = query.is("recovered_at", null).is("dismissed_at", null);
    } else if (statusFilter === "recovered") {
      query = query.not("recovered_at", "is", null);
    } else if (statusFilter === "dismissed") {
      query = query.not("dismissed_at", "is", null);
    }

    if (hotelFilter !== "all") {
      query = query.eq("hotel_id", hotelFilter);
    }

    const { data, error } = await query;

    if (error) {
      toast.error(t("marketing.abandonedCarts.fetchError"));
      setLoading(false);
      return;
    }

    const normalized = (data ?? []).map((r: any) => ({
      ...r,
      customers: Array.isArray(r.customers) ? r.customers[0] : r.customers,
      hotels: Array.isArray(r.hotels) ? r.hotels[0] : r.hotels,
    })) as AbandonedCartRow[];

    setRows(normalized);

    const allTreatmentIds = new Set<string>();
    for (const r of normalized) {
      for (const item of r.cart_items ?? []) {
        if (item.treatmentId) allTreatmentIds.add(item.treatmentId);
      }
    }
    if (allTreatmentIds.size > 0) {
      const { data: treatments } = await supabase
        .from("treatment_menus")
        .select("id, name")
        .in("id", Array.from(allTreatmentIds));
      const map = new Map<string, string>();
      for (const t of treatments ?? []) map.set(t.id, t.name);
      setTreatmentNames(map);
    }

    setLoading(false);
  };

  const handleRelaunch = async (cartId: string) => {
    setSendingId(cartId);
    const { data, error } = await invokeEdgeFunction<
      { abandonedCartId: string },
      { success?: boolean; error?: string }
    >("send-abandoned-cart-reminder", { body: { abandonedCartId: cartId } });

    setSendingId(null);

    if (error || data?.error) {
      toast.error(
        t("marketing.abandonedCarts.sendError", {
          defaultValue: "Erreur lors de l'envoi de la relance",
        }),
      );
      return;
    }

    toast.success(
      t("marketing.abandonedCarts.sendSuccess", {
        defaultValue: "Relance envoyée",
      }),
    );
    fetchData();
  };

  const handleDismiss = async (cartId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("abandoned_carts")
      .update({
        dismissed_at: new Date().toISOString(),
        dismissed_by: user?.id ?? null,
      })
      .eq("id", cartId);
    if (error) {
      toast.error(
        t("marketing.abandonedCarts.dismissError", {
          defaultValue: "Erreur lors de l'ignorance",
        }),
      );
      return;
    }
    toast.success(
      t("marketing.abandonedCarts.dismissSuccess", {
        defaultValue: "Panier marqué comme ignoré",
      }),
    );
    fetchData();
  };

  const formatCartSummary = (row: AbandonedCartRow): string => {
    return (row.cart_items ?? [])
      .map((it) => {
        const name = treatmentNames.get(it.treatmentId) ?? "—";
        const qty = (it.quantity ?? 1) > 1 ? ` × ${it.quantity}` : "";
        return `${name}${qty}`;
      })
      .join(", ");
  };

  const formatSlot = (row: AbandonedCartRow): string => {
    if (row.schedule_mode === "per_item") {
      const slots = (row.cart_items ?? [])
        .filter((i) => i.date && i.time)
        .map((i) => `${i.date} ${(i.time ?? "").substring(0, 5)}`);
      return slots.join(" + ");
    }
    if (row.booking_date && row.booking_time) {
      return `${row.booking_date} ${row.booking_time.substring(0, 5)}`;
    }
    return "—";
  };

  const stats = useMemo(() => {
    const total = rows.length;
    const recovered = rows.filter((r) => r.recovered_at).length;
    const active = rows.filter((r) => !r.recovered_at && !r.dismissed_at).length;
    return { total, recovered, active };
  }, [rows]);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("marketing.abandonedCarts.title", { defaultValue: "Paniers abandonnés" })}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("marketing.abandonedCarts.subtitle", {
              defaultValue:
                "Clients ayant été redirigés vers Stripe sans finaliser leur paiement.",
            })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label={t("marketing.abandonedCarts.statActive", { defaultValue: "Actifs" })}
          value={statusFilter === "active" ? stats.active : "—"}
        />
        <StatCard
          label={t("marketing.abandonedCarts.statRecovered", { defaultValue: "Récupérés" })}
          value={statusFilter === "recovered" ? stats.recovered : "—"}
        />
        <StatCard
          label={t("marketing.abandonedCarts.statTotal", { defaultValue: "Total affiché" })}
          value={stats.total}
        />
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">
              {t("marketing.abandonedCarts.filterActive", { defaultValue: "Actifs" })}
            </SelectItem>
            <SelectItem value="recovered">
              {t("marketing.abandonedCarts.filterRecovered", { defaultValue: "Récupérés" })}
            </SelectItem>
            <SelectItem value="dismissed">
              {t("marketing.abandonedCarts.filterDismissed", { defaultValue: "Ignorés" })}
            </SelectItem>
            <SelectItem value="all">
              {t("marketing.abandonedCarts.filterAll", { defaultValue: "Tous" })}
            </SelectItem>
          </SelectContent>
        </Select>

        <Select value={hotelFilter} onValueChange={setHotelFilter}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("marketing.abandonedCarts.filterAllVenues", { defaultValue: "Tous les lieux" })}
            </SelectItem>
            {hotels.map((h) => (
              <SelectItem key={h.id} value={h.id}>
                {h.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("marketing.abandonedCarts.colClient", { defaultValue: "Client" })}</TableHead>
              <TableHead>{t("marketing.abandonedCarts.colVenue", { defaultValue: "Lieu" })}</TableHead>
              <TableHead>{t("marketing.abandonedCarts.colCart", { defaultValue: "Panier" })}</TableHead>
              <TableHead>{t("marketing.abandonedCarts.colSlot", { defaultValue: "Créneau" })}</TableHead>
              <TableHead className="text-right">
                {t("marketing.abandonedCarts.colTotal", { defaultValue: "Total" })}
              </TableHead>
              <TableHead>{t("marketing.abandonedCarts.colCreated", { defaultValue: "Créé" })}</TableHead>
              <TableHead>{t("marketing.abandonedCarts.colReminders", { defaultValue: "Relances" })}</TableHead>
              <TableHead>{t("marketing.abandonedCarts.colStatus", { defaultValue: "Statut" })}</TableHead>
              <TableHead className="text-right">
                {t("marketing.abandonedCarts.colActions", { defaultValue: "Actions" })}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableSkeleton rows={6} columns={9} />
            ) : rows.length === 0 ? (
              <TableEmptyState
                icon={ShoppingCart}
                title={t("marketing.abandonedCarts.empty", { defaultValue: "Aucun panier abandonné" })}
                colSpan={9}
              />
            ) : (
              rows.map((r) => {
                const customer = r.customers;
                const isRecovered = !!r.recovered_at;
                const isDismissed = !!r.dismissed_at;
                const canRelaunch = !isRecovered && !isDismissed && !!customer?.email;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">
                        {customer?.first_name} {customer?.last_name}
                      </div>
                      <div className="text-xs text-muted-foreground">{customer?.email}</div>
                    </TableCell>
                    <TableCell>{r.hotels?.name ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate" title={formatCartSummary(r)}>
                      {formatCartSummary(r)}
                    </TableCell>
                    <TableCell className="text-sm">{formatSlot(r)}</TableCell>
                    <TableCell className="text-right">{r.total_price.toFixed(2)}€</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(r.created_at), "dd/MM HH:mm")}
                    </TableCell>
                    <TableCell>
                      {r.reminder_count > 0 ? (
                        <span className="text-sm">
                          {r.reminder_count}
                          {r.last_reminder_at && (
                            <span className="block text-xs text-muted-foreground">
                              {format(new Date(r.last_reminder_at), "dd/MM HH:mm")}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isRecovered ? (
                        <Badge variant="default">
                          {t("marketing.abandonedCarts.statusRecovered", {
                            defaultValue: "Récupéré",
                          })}
                        </Badge>
                      ) : isDismissed ? (
                        <Badge variant="secondary">
                          {t("marketing.abandonedCarts.statusDismissed", {
                            defaultValue: "Ignoré",
                          })}
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          {t("marketing.abandonedCarts.statusActive", {
                            defaultValue: "Actif",
                          })}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canRelaunch && (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleRelaunch(r.id)}
                              disabled={sendingId === r.id}
                            >
                              <Send className="h-3.5 w-3.5 mr-1" />
                              {sendingId === r.id
                                ? t("marketing.abandonedCarts.sending", {
                                    defaultValue: "Envoi...",
                                  })
                                : t("marketing.abandonedCarts.relaunch", {
                                    defaultValue: "Relancer",
                                  })}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDismiss(r.id)}
                              title={t("marketing.abandonedCarts.dismiss", {
                                defaultValue: "Ignorer",
                              })}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
