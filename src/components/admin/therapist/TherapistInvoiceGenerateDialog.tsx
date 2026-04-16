import { useMemo, useState } from "react";
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
import { Loader2, FileText } from "lucide-react";
import { invokeEdgeFunction } from "@/lib/supabaseEdgeFunctions";

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

  const now = new Date();
  const defaultMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [year, setYear] = useState(defaultMonth.getFullYear());
  const [month, setMonth] = useState(defaultMonth.getMonth() + 1); // 1-12

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
      const periodStart = `${year}-${pad2(month)}-01`;
      const endDate = new Date(year, month, 0); // last day of month
      const periodEnd = `${year}-${pad2(month)}-${pad2(endDate.getDate())}`;

      interface GenerateResponse {
        success: boolean;
        generated: number;
        skipped: number;
        results: Array<{ success: boolean; skipped?: boolean; error?: string }>;
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

      if (data.generated === 0 && data.skipped > 0) {
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

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={generating}
          >
            {t("common:cancel", "Annuler")}
          </Button>
          <Button onClick={handleGenerate} disabled={generating}>
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
