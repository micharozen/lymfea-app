import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Card, CardContent } from "@/components/ui/card";
import { Download, Eye, FileText, Loader2, Plus } from "lucide-react";
import { InvoicePreviewDialog } from "@/components/booking/InvoicePreviewDialog";
import { VenueInvoiceGenerateDialog } from "./VenueInvoiceGenerateDialog";

interface InvoiceRow {
  id: string;
  invoice_number: string;
  created_at: string;
  period_start: string;
  period_end: string;
  amount_ht: number;
  vat_rate: number;
  vat_amount: number;
  amount_ttc: number;
  status: string;
  html_snapshot: string | null;
}

interface VenueBillingTabProps {
  hotelId: string;
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  issued: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const formatAmount = (n: number): string =>
  n.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " €";

const formatPeriod = (start: string, end: string): string => {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleDateString("fr-FR")} → ${e.toLocaleDateString("fr-FR")}`;
};

export function VenueBillingTab({ hotelId }: VenueBillingTabProps) {
  const { t } = useTranslation("admin");
  const [generateOpen, setGenerateOpen] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceRow | null>(null);

  const {
    data: invoices,
    isLoading,
    refetch,
  } = useQuery<InvoiceRow[]>({
    queryKey: ["venue-invoices", hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          `
          id,
          invoice_number,
          created_at,
          period_start,
          period_end,
          amount_ht,
          vat_rate,
          vat_amount,
          amount_ttc,
          status,
          html_snapshot
        `,
        )
        .eq("hotel_id", hotelId)
        .eq("invoice_kind", "hotel_commission")
        .order("period_start", { ascending: false })
        .order("invoice_number", { ascending: false });

      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        invoice_number: r.invoice_number,
        created_at: r.created_at,
        period_start: r.period_start,
        period_end: r.period_end,
        amount_ht: Number(r.amount_ht),
        vat_rate: Number(r.vat_rate),
        vat_amount: Number(r.vat_amount),
        amount_ttc: Number(r.amount_ttc),
        status: r.status,
        html_snapshot: r.html_snapshot,
      }));
    },
  });

  const handleDownload = async (invoice: InvoiceRow) => {
    if (!invoice.html_snapshot) return;
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const element = document.createElement("div");
      element.innerHTML = invoice.html_snapshot;
      document.body.appendChild(element);
      html2pdf()
        .set({
          margin: 0,
          filename: `${invoice.invoice_number}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, letterRendering: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(element)
        .save()
        .then(() => {
          document.body.removeChild(element);
        });
    } catch (err) {
      console.error("Error downloading invoice:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {t("venue.billingTab.title", "Factures")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              "venue.billingTab.description",
              "Historique des factures générées pour ce lieu",
            )}
          </p>
        </div>
        <Button onClick={() => setGenerateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("venue.billingTab.generateInvoice", "Générer une facture")}
        </Button>
      </div>

      {!invoices || invoices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <h3 className="text-sm font-medium">
              {t("venue.billingTab.noInvoices", "Aucune facture générée")}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t(
                "venue.billingTab.noInvoicesHint",
                "Cliquez sur Générer une facture pour créer la facturation sur une période",
              )}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t("venue.billingTab.columns.number", "Numéro")}
                </TableHead>
                <TableHead>
                  {t("venue.billingTab.columns.generatedAt", "Date de génération")}
                </TableHead>
                <TableHead>
                  {t("venue.billingTab.columns.period", "Période")}
                </TableHead>
                <TableHead className="text-right">
                  {t("venue.billingTab.columns.totalHt", "Total HT")}
                </TableHead>
                <TableHead className="text-right">
                  {t("venue.billingTab.columns.vat", "TVA")}
                </TableHead>
                <TableHead className="text-right">
                  {t("venue.billingTab.columns.totalTtc", "Total TTC")}
                </TableHead>
                <TableHead>
                  {t("venue.billingTab.columns.status", "Statut")}
                </TableHead>
                <TableHead className="w-[120px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs">
                    {inv.invoice_number}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(inv.created_at).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>
                    {formatPeriod(inv.period_start, inv.period_end)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatAmount(inv.amount_ht)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatAmount(inv.vat_amount)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatAmount(inv.amount_ttc)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={statusColors[inv.status] ?? ""}
                    >
                      {t(
                        `venue.billingTab.status.${inv.status}`,
                        inv.status,
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setPreviewInvoice(inv)}
                        disabled={!inv.html_snapshot}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleDownload(inv)}
                        disabled={!inv.html_snapshot}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <VenueInvoiceGenerateDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        hotelId={hotelId}
        onGenerated={() => refetch()}
      />

      {previewInvoice && (
        <InvoicePreviewDialog
          open={!!previewInvoice}
          onOpenChange={(open) => !open && setPreviewInvoice(null)}
          invoiceHTML={previewInvoice.html_snapshot ?? ""}
          bookingId={null}
          isRoomPayment={false}
          title={`Facture ${previewInvoice.invoice_number}`}
          filename={`${previewInvoice.invoice_number}.pdf`}
        />
      )}
    </div>
  );
}
