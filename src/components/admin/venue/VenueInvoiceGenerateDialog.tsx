import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, FileText } from "lucide-react";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";

interface VenueInvoiceGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hotelId: string;
  onGenerated?: () => void;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const currentMonthRange = (): { start: string; end: string } => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: toIso(start), end: toIso(end) };
};

const previousMonthRange = (): { start: string; end: string } => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return { start: toIso(start), end: toIso(end) };
};

export function VenueInvoiceGenerateDialog({
  open,
  onOpenChange,
  hotelId,
  onGenerated,
}: VenueInvoiceGenerateDialogProps) {
  const { t } = useTranslation("admin");
  const [generating, setGenerating] = useState(false);

  const defaults = previousMonthRange();
  const [periodStart, setPeriodStart] = useState(defaults.start);
  const [periodEnd, setPeriodEnd] = useState(defaults.end);

  const applyShortcut = (range: { start: string; end: string }) => {
    setPeriodStart(range.start);
    setPeriodEnd(range.end);
  };

  const handleGenerate = async () => {
    if (!periodStart || !periodEnd) {
      toast.error(
        t("venue.billingTab.missingPeriod", "Veuillez sélectionner une période"),
      );
      return;
    }
    if (periodEnd < periodStart) {
      toast.error(
        t(
          "venue.billingTab.invalidPeriod",
          "La date de fin doit être postérieure à la date de début",
        ),
      );
      return;
    }

    setGenerating(true);
    try {
      interface GenerateResponse {
        success: boolean;
        generated: number;
        skipped: number;
        results: Array<{ success: boolean; skipped?: boolean; error?: string }>;
      }

      const { data, error } = await invokeEdgeFunction<
        Record<string, unknown>,
        GenerateResponse
      >("generate-venue-invoices", {
        body: {
          mode: "manual",
          hotel_id: hotelId,
          period_start: periodStart,
          period_end: periodEnd,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error("Generation failed");

      if (data.generated === 0 && data.skipped > 0) {
        toast.info(
          t(
            "venue.billingTab.noBookings",
            "Aucune prestation à facturer sur cette période",
          ),
        );
      } else {
        toast.success(
          t("venue.billingTab.generated", "{{count}} facture(s) générée(s)", {
            count: data.generated,
          }),
        );
      }

      onGenerated?.();
      onOpenChange(false);
    } catch (err) {
      console.error("Error generating venue invoice:", err);
      toast.error(
        t("venue.billingTab.generateError", "Erreur lors de la génération"),
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
            {t("venue.billingTab.generateInvoice", "Générer une facture")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "venue.billingTab.generateDesc",
              "Une facture regroupera toutes les prestations du lieu sur la période sélectionnée.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyShortcut(currentMonthRange())}
              disabled={generating}
            >
              {t("venue.billingTab.currentMonth", "Mois en cours")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyShortcut(previousMonthRange())}
              disabled={generating}
            >
              {t("venue.billingTab.previousMonth", "Mois précédent")}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {t("venue.billingTab.periodStart", "Du")}
              </label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                disabled={generating}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {t("venue.billingTab.periodEnd", "Au")}
              </label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                disabled={generating}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={generating}
          >
            {t("common.cancel", "Annuler")}
          </Button>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            {t("venue.billingTab.generate", "Générer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
