import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, FileText, AlertTriangle, CheckCheck } from "lucide-react";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";
import { supabase } from "@/integrations/supabase/client";

// Payment statuses considered as "paid" — must stay in sync with the
// generate-therapist-invoices edge function.
const PAID_STATUSES = ["paid", "charged_to_room", "offert"] as const;

interface PendingBooking {
  id: string;
  booking_date: string;
  total_price: number | null;
  client_first_name: string | null;
  client_last_name: string | null;
  hotel_name: string | null;
}

interface TherapistInvoiceGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  therapistId: string;
  onGenerated?: () => void;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function TherapistInvoiceGenerateDialog({
  open,
  onOpenChange,
  therapistId,
  onGenerated,
}: TherapistInvoiceGenerateDialogProps) {
  const { t } = useTranslation("common");
  const [generating, setGenerating] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [pending, setPending] = useState<PendingBooking[]>([]);

  const now = new Date();
  const defaultMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [year, setYear] = useState(defaultMonth.getFullYear());
  const [month, setMonth] = useState(defaultMonth.getMonth() + 1); // 1-12

  const period = useMemo(() => {
    const periodStart = `${year}-${pad2(month)}-01`;
    const endDate = new Date(year, month, 0); // last day of month
    const periodEnd = `${year}-${pad2(month)}-${pad2(endDate.getDate())}`;
    return { periodStart, periodEnd };
  }, [year, month]);

  // Load bookings in the period that are paid but not yet finalized
  // (neither completed nor cancelled) — these are excluded from the invoice
  // until finalized.
  const loadPending = async () => {
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, booking_date, total_price, client_first_name, client_last_name, hotels(name)",
        )
        .eq("therapist_id", therapistId)
        .gte("booking_date", period.periodStart)
        .lte("booking_date", period.periodEnd)
        .not("status", "in", "(completed,cancelled)")
        .in("payment_status", PAID_STATUSES)
        .order("booking_date");
      if (error) throw error;
      setPending(
        (data ?? []).map((b) => ({
          id: b.id,
          booking_date: b.booking_date,
          total_price: b.total_price,
          client_first_name: b.client_first_name,
          client_last_name: b.client_last_name,
          hotel_name: (b as { hotels?: { name?: string } | null }).hotels?.name ?? null,
        })),
      );
    } catch (err) {
      console.error("Error loading pending bookings:", err);
      setPending([]);
    }
  };

  useEffect(() => {
    if (!open) return;
    loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, period]);

  const handleFinalize = async () => {
    if (pending.length === 0) return;
    setFinalizing(true);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ status: "completed" })
        .in(
          "id",
          pending.map((b) => b.id),
        );
      if (error) throw error;
      toast.success(
        t("admin:therapists.billingTab.finalized", "{{count}} réservation(s) finalisée(s)", {
          count: pending.length,
        }),
      );
      await loadPending();
    } catch (err) {
      console.error("Error finalizing bookings:", err);
      toast.error(
        t("admin:therapists.billingTab.finalizeError", "Erreur lors de la finalisation"),
      );
    } finally {
      setFinalizing(false);
    }
  };

  const formatDate = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });

  const clientName = (b: PendingBooking) =>
    [b.client_first_name, b.client_last_name].filter(Boolean).join(" ") || "—";

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return [current - 1, current, current + 1];
  }, []);

  const monthLabels = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(2025, i, 1);
      return { value: i + 1, label: d.toLocaleDateString("fr-FR", { month: "long" }) };
    });
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { periodStart, periodEnd } = period;

      interface GenerateResponse {
        success: boolean;
        generated: number;
        skipped: number;
        results: Array<{
          success: boolean;
          skipped?: boolean;
          reason?: string;
          error?: string;
        }>;
      }

      const { data, error } = await invokeEdgeFunction<
        Record<string, unknown>,
        GenerateResponse
      >("generate-therapist-invoices", {
        body: {
          mode: "manual",
          therapist_id: therapistId,
          period_start: periodStart,
          period_end: periodEnd,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error("Generation failed");

      const hasMissingRates = data.results?.some((r) => r.reason === "missing_rates");

      if (data.generated === 0 && hasMissingRates) {
        toast.warning(
          t(
            "admin:therapists.billingTab.missingRates",
            "Tarifs manquants pour ce thérapeute : impossible de calculer la rémunération. Renseignez ses tarifs avant de facturer.",
          ),
        );
      } else if (data.generated === 0 && data.skipped > 0) {
        toast.info(
          t(
            "admin:therapists.billingTab.noBookings",
            "Aucun booking à facturer pour ce mois",
          ),
        );
      } else {
        toast.success(
          t("admin:therapists.billingTab.generated", "{{count}} facture(s) générée(s)", {
            count: data.generated,
          }),
        );
      }

      onGenerated?.();
      onOpenChange(false);
    } catch (err) {
      console.error("Error generating invoices:", err);
      toast.error(
        t("admin:therapists.billingTab.generateError", "Erreur lors de la génération"),
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {t("admin:therapists.billingTab.generateInvoices", "Générer les factures")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "admin:therapists.billingTab.generateDesc",
              "Une facture sera générée par lieu où le thérapeute a des réservations sur le mois sélectionné.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t("admin:therapists.billingTab.month", "Mois")}
            </label>
            <Select
              value={String(month)}
              onValueChange={(v) => setMonth(Number(v))}
              disabled={generating}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthLabels.map((m) => (
                  <SelectItem key={m.value} value={String(m.value)}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t("admin:therapists.billingTab.year", "Année")}
            </label>
            <Select
              value={String(year)}
              onValueChange={(v) => setYear(Number(v))}
              disabled={generating}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {pending.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-800">
                {t(
                  "admin:therapists.billingTab.pendingWarning",
                  "{{count}} réservation(s) payée(s) sur cette période ne sont pas finalisées et seront exclues de la facture.",
                  { count: pending.length },
                )}
              </p>
            </div>
            <ul className="space-y-1 max-h-40 overflow-y-auto text-sm">
              {pending.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-2 rounded bg-white/60 px-2 py-1"
                >
                  <span className="text-gray-600 tabular-nums w-14 flex-shrink-0">
                    {formatDate(b.booking_date)}
                  </span>
                  <span className="truncate flex-1">{clientName(b)}</span>
                  <span className="text-gray-500 truncate hidden sm:block flex-1">
                    {b.hotel_name ?? "—"}
                  </span>
                  <span className="tabular-nums font-medium flex-shrink-0">
                    {Number(b.total_price ?? 0).toLocaleString("fr-FR")} €
                  </span>
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-amber-700 border-amber-300 bg-white hover:bg-amber-100 hover:text-amber-800"
              onClick={handleFinalize}
              disabled={finalizing || generating}
            >
              {finalizing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="mr-2 h-4 w-4" />
              )}
              {t("admin:therapists.billingTab.finalizeAll", "Les finaliser")}
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={generating || finalizing}
          >
            {t("common:cancel", "Annuler")}
          </Button>
          <Button onClick={handleGenerate} disabled={generating || finalizing}>
            {generating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            {t("admin:therapists.billingTab.generate", "Générer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
