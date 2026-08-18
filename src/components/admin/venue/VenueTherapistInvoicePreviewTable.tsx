import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Download, Eye, Loader2 } from "lucide-react";
import { formatDateTimeFr, formatPeriodFr, type DateRange } from "@/lib/billingPeriod";
import { isBillable, type TherapistInvoiceRow } from "@/hooks/useTherapistInvoiceBatch";

interface VenueTherapistInvoicePreviewTableProps {
  rows: TherapistInvoiceRow[];
  /** Période prévisualisée, pour situer la facture qui serait remplacée. */
  range: DateRange;
  selected: Set<string>;
  onToggle: (therapistId: string) => void;
  onToggleAll: (checked: boolean) => void;
  onPreviewHtml: (row: TherapistInvoiceRow) => void;
  onDownload: (row: TherapistInvoiceRow) => void;
  /** Thérapeute dont l'aperçu HTML est en cours de chargement. */
  previewingTherapistId: string | null;
  disabled: boolean;
}

const formatAmount = (n: number | undefined): string =>
  n === undefined
    ? "—"
    : n.toLocaleString("fr-FR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " €";

export function VenueTherapistInvoicePreviewTable({
  rows,
  range,
  selected,
  onToggle,
  onToggleAll,
  onPreviewHtml,
  onDownload,
  previewingTherapistId,
  disabled,
}: VenueTherapistInvoicePreviewTableProps) {
  const { t } = useTranslation("admin");

  const billableRows = rows.filter(isBillable);
  const allSelected =
    billableRows.length > 0 && billableRows.every((r) => selected.has(r.therapist_id));
  const someSelected = billableRows.some((r) => selected.has(r.therapist_id));

  const renderStatus = (row: TherapistInvoiceRow) => {
    if (row.invoiceId) {
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-700 font-normal">
          {t("venue.therapistInvoices.status.generated", "Générée")}
        </Badge>
      );
    }

    if (!row.success) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="destructive" className="font-normal">
                {t("venue.therapistInvoices.status.error", "Erreur")}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {row.error ?? t("venue.therapistInvoices.status.error", "Erreur")}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    if (row.reason === "missing_rates") {
      return (
        <div className="flex items-center gap-2">
          <Badge variant="destructive" className="font-normal">
            {t("venue.therapistInvoices.status.missingRates", "Tarifs manquants")}
          </Badge>
          <Link
            to={`/admin/therapists/${row.therapist_id}`}
            className="text-xs underline text-muted-foreground hover:text-foreground"
          >
            {t("venue.therapistInvoices.status.missingRatesAction", "Configurer les tarifs")}
          </Link>
        </div>
      );
    }

    if (row.reason === "no_bookings") {
      return (
        <span className="text-xs text-muted-foreground">
          {t("venue.therapistInvoices.status.noBookings", "Aucune prestation")}
        </span>
      );
    }

    if (row.reason === "zero_amount") {
      return (
        <span className="text-xs text-muted-foreground">
          {t("venue.therapistInvoices.status.zeroAmount", "Montant nul")}
        </span>
      );
    }

    if (row.existingInvoiceNumber) {
      // Même période : la régénération est un simple recalcul. Période
      // différente : la facture existante sera écrasée par une autre plage,
      // ce que l'utilisateur doit voir avant de cocher la ligne.
      const samePeriod = row.existingPeriodEnd === range.end;
      return (
        <Badge
          variant="secondary"
          className={
            samePeriod
              ? "font-normal"
              : "bg-amber-100 text-amber-800 whitespace-normal text-left font-normal"
          }
        >
          {samePeriod
            ? t("venue.therapistInvoices.status.alreadyInvoiced", "Déjà facturé · {{number}}", {
                number: row.existingInvoiceNumber,
              })
            : t(
                "venue.therapistInvoices.status.willReplace",
                "Remplacera {{number}} ({{period}})",
                {
                  number: row.existingInvoiceNumber,
                  period: formatPeriodFr(range.start, row.existingPeriodEnd ?? range.end),
                },
              )}
        </Badge>
      );
    }

    return (
      <Badge variant="secondary" className="font-normal">
        {t("venue.therapistInvoices.status.toGenerate", "À générer")}
      </Badge>
    );
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[44px]">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={(checked) => onToggleAll(checked === true)}
                disabled={disabled || billableRows.length === 0}
                aria-label={t("venue.therapistInvoices.selectAll", "Tout sélectionner")}
              />
            </TableHead>
            <TableHead>
              {t("venue.therapistInvoices.columns.therapist", "Thérapeute")}
            </TableHead>
            <TableHead className="text-right">
              {t("venue.therapistInvoices.columns.bookings", "Résas")}
            </TableHead>
            <TableHead className="text-right">
              {t("venue.therapistInvoices.columns.totalHt", "Total HT")}
            </TableHead>
            <TableHead className="text-right">
              {t("venue.therapistInvoices.columns.vat", "TVA")}
            </TableHead>
            <TableHead className="text-right">
              {t("venue.therapistInvoices.columns.totalTtc", "Total TTC")}
            </TableHead>
            <TableHead>
              {t("venue.therapistInvoices.columns.status", "Statut")}
            </TableHead>
            <TableHead>
              {t("venue.therapistInvoices.issued.columns.generatedAt", "Générée le")}
            </TableHead>
            <TableHead className="w-[100px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const billable = isBillable(row);
            return (
              <TableRow
                key={row.therapist_id}
                className={billable ? undefined : "opacity-60"}
              >
                <TableCell>
                  <Checkbox
                    checked={selected.has(row.therapist_id)}
                    onCheckedChange={() => onToggle(row.therapist_id)}
                    disabled={disabled || !billable}
                    aria-label={row.therapist_name}
                  />
                </TableCell>
                <TableCell>
                  <div>{row.therapist_name || "—"}</div>
                  {row.therapist_email && (
                    <div className="text-xs text-muted-foreground">{row.therapist_email}</div>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.bookingsCount ?? 0}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {billable ? formatAmount(row.amountHt) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {billable ? formatAmount(row.vatAmount) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {billable ? formatAmount(row.amountTtc) : "—"}
                </TableCell>
                <TableCell>{renderStatus(row)}</TableCell>
                <TableCell className="text-sm text-muted-foreground tabular-nums">
                  {row.generatedAt ? formatDateTimeFr(row.generatedAt) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onPreviewHtml(row)}
                      disabled={disabled || !billable}
                    >
                      {previewingTherapistId === row.therapist_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onDownload(row)}
                      disabled={disabled || !row.invoiceId}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
