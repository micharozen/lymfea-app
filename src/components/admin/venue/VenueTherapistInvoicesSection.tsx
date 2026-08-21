import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertTriangle,
  CheckCheck,
  Download,
  Eye,
  FileText,
  Loader2,
  Search,
} from "lucide-react";
import { InvoicePreviewDialog } from "@/components/booking/InvoicePreviewDialog";
import { VenueTherapistInvoicePreviewTable } from "./VenueTherapistInvoicePreviewTable";
import {
  isBillable,
  useTherapistInvoiceGeneration,
  useTherapistInvoiceHtml,
  useTherapistInvoicePreview,
  type TherapistInvoiceRow,
} from "@/hooks/useTherapistInvoiceBatch";
import { useUnfinalizedBookings } from "@/hooks/useUnfinalizedBookings";
import {
  currentMonthRange,
  formatDateTimeFr,
  formatPeriodLabelFr,
  nextMonthRange,
  previousMonthRange,
  type DateRange,
} from "@/lib/billingPeriod";
import { downloadInvoicePdf, downloadInvoicePdfBatch } from "@/lib/invoicePdf";

interface VenueTherapistInvoicesSectionProps {
  hotelId: string;
}

interface IssuedInvoice {
  id: string;
  invoice_number: string;
  therapist_id: string | null;
  period_start: string;
  period_end: string;
  generated_at: string | null;
  created_at: string;
  amount_ht: number;
  amount_ttc: number;
  status: string;
  html_snapshot: string | null;
  therapists: { first_name: string | null; last_name: string | null; email: string | null } | null;
}

const formatAmount = (n: number): string =>
  n.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " €";

/** Recherche insensible à la casse et aux accents, sur le thérapeute ou le numéro. */
const normalize = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const matchesIssuedSearch = (invoice: IssuedInvoice, query: string): boolean => {
  const needle = normalize(query.trim());
  if (!needle) return true;
  const haystack = normalize(
    [
      invoice.therapists?.first_name,
      invoice.therapists?.last_name,
      invoice.invoice_number,
    ]
      .filter(Boolean)
      .join(" "),
  );
  return haystack.includes(needle);
};

export function VenueTherapistInvoicesSection({ hotelId }: VenueTherapistInvoicesSectionProps) {
  const { t } = useTranslation(["admin", "common"]);
  const queryClient = useQueryClient();

  const [range, setRange] = useState<DateRange>(previousMonthRange());
  const [rows, setRows] = useState<TherapistInvoiceRow[]>([]);
  const [previewed, setPreviewed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [htmlPreview, setHtmlPreview] = useState<{ title: string; html: string } | null>(null);
  const [issuedPreview, setIssuedPreview] = useState<IssuedInvoice | null>(null);
  const [issuedSearch, setIssuedSearch] = useState("");
  /** `null` = aucun pli forcé par l'utilisateur, on suit la valeur dérivée. */
  const [expandedPeriods, setExpandedPeriods] = useState<string[] | null>(null);
  const [previewingTherapistId, setPreviewingTherapistId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const preview = useTherapistInvoicePreview(hotelId);
  const invoiceHtml = useTherapistInvoiceHtml(hotelId);
  const { generate, progress, isGenerating } = useTherapistInvoiceGeneration(hotelId);
  const {
    bookings: unfinalized,
    finalizing,
    finalize,
  } = useUnfinalizedBookings({ hotelId, range });

  // Factures déjà émises pour ce lieu. C'est cette liste — et non la
  // prévisualisation, volontairement éphémère pour ne jamais afficher de
  // montants périmés — qui garde la trace du travail après un rafraîchissement.
  const { data: issuedInvoices, isLoading: issuedLoading } = useQuery<IssuedInvoice[]>({
    queryKey: ["venue-therapist-invoices", hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id, invoice_number, therapist_id, period_start, period_end, generated_at, created_at, amount_ht, amount_ttc, status, html_snapshot, therapists(first_name, last_name, email)",
        )
        .eq("hotel_id", hotelId)
        .eq("invoice_kind", "therapist_commission")
        .order("period_start", { ascending: false })
        .order("invoice_number", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        amount_ht: Number(r.amount_ht),
        amount_ttc: Number(r.amount_ttc),
      })) as IssuedInvoice[];
    },
  });

  // Les factures se lisent d'abord par période (une campagne mensuelle), puis
  // par thérapeute : on regroupe plutôt que d'aligner une liste plate.
  const issuedPeriods = useMemo(() => {
    const groups = new Map<string, IssuedInvoice[]>();
    for (const invoice of issuedInvoices ?? []) {
      if (!matchesIssuedSearch(invoice, issuedSearch)) continue;
      const key = `${invoice.period_start}_${invoice.period_end}`;
      const bucket = groups.get(key);
      if (bucket) bucket.push(invoice);
      else groups.set(key, [invoice]);
    }

    return [...groups.entries()]
      .map(([key, invoices]) => ({
        key,
        label: formatPeriodLabelFr(invoices[0].period_start, invoices[0].period_end),
        periodStart: invoices[0].period_start,
        invoices: [...invoices].sort((a, b) =>
          (a.therapists?.last_name ?? "").localeCompare(b.therapists?.last_name ?? ""),
        ),
        totalTtc: invoices.reduce((sum, i) => sum + i.amount_ttc, 0),
      }))
      .sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  }, [issuedInvoices, issuedSearch]);

  // Une recherche n'a d'intérêt que si ses résultats sont visibles : on déplie
  // les périodes correspondantes, sinon on garde le choix de l'utilisateur
  // (à défaut, la période la plus récente).
  const openPeriods =
    expandedPeriods ??
    (issuedSearch.trim()
      ? issuedPeriods.map((p) => p.key)
      : issuedPeriods.slice(0, 1).map((p) => p.key));

  const busy = preview.isPending || isGenerating || finalizing || downloadProgress !== null;

  /** Une période modifiée invalide les montants affichés. */
  const applyRange = (next: DateRange) => {
    setRange(next);
    setRows([]);
    setSelected(new Set());
    setPreviewed(false);
  };

  const runPreview = async (target: DateRange = range) => {
    if (!target.start || !target.end) {
      toast.error(t("venue.therapistInvoices.missingPeriod", "Veuillez sélectionner une période"));
      return;
    }
    if (target.end < target.start) {
      toast.error(
        t(
          "venue.therapistInvoices.invalidPeriod",
          "La date de fin doit être postérieure à la date de début",
        ),
      );
      return;
    }

    try {
      const data = await preview.mutateAsync(target);
      setRows(data.results);
      setPreviewed(true);
      // Présélection : tout ce qui est facturable et pas déjà facturé — les
      // écrasements restent un choix explicite.
      setSelected(
        new Set(
          data.results
            .filter((r) => isBillable(r) && !r.existingInvoiceId)
            .map((r) => r.therapist_id),
        ),
      );
    } catch (err) {
      console.error("Error previewing therapist invoices:", err);
      toast.error(
        t("venue.therapistInvoices.previewError", "Erreur lors de la prévisualisation"),
      );
    }
  };

  const toggle = (therapistId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(therapistId)) next.delete(therapistId);
      else next.add(therapistId);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(rows.filter(isBillable).map((r) => r.therapist_id)) : new Set());
  };

  const selectedRows = rows.filter((r) => selected.has(r.therapist_id));
  const overwrittenRows = selectedRows.filter((r) => r.existingInvoiceNumber);
  const totalHt = selectedRows.reduce((sum, r) => sum + (r.amountHt ?? 0), 0);
  const totalTtc = selectedRows.reduce((sum, r) => sum + (r.amountTtc ?? 0), 0);
  const billableCount = rows.filter(isBillable).length;
  const skippedCount = rows.length - billableCount;
  const generatedRows = rows.filter((r) => r.invoiceId);

  const runGeneration = async () => {
    setConfirmOverwrite(false);
    try {
      const results = await generate(
        range,
        selectedRows.map((r) => r.therapist_id),
      );

      // Chaque ligne porte son propre résultat : le tableau n'est jamais vidé,
      // les échecs restent lisibles à côté des succès.
      const byTherapist = new Map(results.map((r) => [r.therapist_id, r]));
      setRows((prev) =>
        prev.map((row) => {
          const result = byTherapist.get(row.therapist_id);
          return result ? { ...row, ...result } : row;
        }),
      );
      setSelected(new Set());

      const okCount = results.filter((r) => r.invoiceId).length;
      const failCount = results.filter((r) => !r.success).length;

      if (okCount > 0) {
        toast.success(
          t("venue.therapistInvoices.generated", "{{count}} facture(s) générée(s)", {
            count: okCount,
          }),
        );
      }
      if (failCount > 0) {
        toast.error(
          t(
            "venue.therapistInvoices.generateFailures",
            "{{count}} échec(s) — voir le détail dans le tableau",
            { count: failCount },
          ),
        );
      }

      // Attendu : le téléchargement groupé lit les html_snapshot de cette query.
      await queryClient.invalidateQueries({
        queryKey: ["venue-therapist-invoices", hotelId],
      });
    } catch (err) {
      console.error("Error generating therapist invoices:", err);
      toast.error(t("venue.therapistInvoices.generateError", "Erreur lors de la génération"));
    }
  };

  const handleGenerateClick = () => {
    if (selectedRows.length === 0) return;
    if (overwrittenRows.length > 0) {
      setConfirmOverwrite(true);
      return;
    }
    runGeneration();
  };

  const handleFinalize = async () => {
    try {
      const count = await finalize();
      if (count === 0) return;
      toast.success(
        t("venue.therapistInvoices.unfinalized.finalized", "{{count}} réservation(s) finalisée(s)", {
          count,
        }),
      );
      // Les montants affichés ne tiennent plus compte de ces réservations.
      if (previewed) await runPreview();
    } catch (err) {
      console.error("Error finalizing bookings:", err);
      toast.error(
        t("venue.therapistInvoices.unfinalized.finalizeError", "Erreur lors de la finalisation"),
      );
    }
  };

  const handlePreviewHtml = async (row: TherapistInvoiceRow) => {
    setPreviewingTherapistId(row.therapist_id);
    try {
      const html = await invoiceHtml.mutateAsync({
        therapistId: row.therapist_id,
        range,
      });
      if (!html) {
        toast.error(t("venue.therapistInvoices.previewError", "Erreur lors de la prévisualisation"));
        return;
      }
      setHtmlPreview({ title: row.therapist_name, html });
    } catch (err) {
      console.error("Error loading invoice preview:", err);
      toast.error(t("venue.therapistInvoices.previewError", "Erreur lors de la prévisualisation"));
    } finally {
      setPreviewingTherapistId(null);
    }
  };

  const invoiceById = new Map((issuedInvoices ?? []).map((inv) => [inv.id, inv]));

  const pdfItemsFor = (targetRows: TherapistInvoiceRow[]) =>
    targetRows.flatMap((row) => {
      const invoice = row.invoiceId ? invoiceById.get(row.invoiceId) : undefined;
      if (!invoice?.html_snapshot) return [];
      return [{ html: invoice.html_snapshot, filename: `${invoice.invoice_number}.pdf` }];
    });

  const handleDownloadOne = async (row: TherapistInvoiceRow) => {
    const items = pdfItemsFor([row]);
    if (items.length === 0) return;
    setDownloadProgress({ done: 0, total: 1 });
    try {
      await downloadInvoicePdfBatch(items);
    } finally {
      setDownloadProgress(null);
    }
  };

  const handleDownloadAll = async () => {
    const items = pdfItemsFor(generatedRows);
    if (items.length === 0) {
      toast.error(t("venue.therapistInvoices.downloadError", "Aucun PDF disponible"));
      return;
    }
    setDownloadProgress({ done: 0, total: items.length });
    try {
      const { ok } = await downloadInvoicePdfBatch(items, (done, total) =>
        setDownloadProgress({ done, total }),
      );
      toast.success(
        t("venue.therapistInvoices.downloadDone", "{{count}} PDF téléchargé(s)", { count: ok }),
      );
    } finally {
      setDownloadProgress(null);
    }
  };

  return (
    <div className="space-y-4 pt-6">
      <div>
        <h2 className="text-lg font-normal">
          {t("venue.therapistInvoices.title", "Factures thérapeutes")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "venue.therapistInvoices.description",
            "Générez en une fois les factures des thérapeutes ayant travaillé dans ce lieu sur la période.",
          )}
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyRange(previousMonthRange())}
              disabled={busy}
            >
              {t("venue.therapistInvoices.previousMonth", "Mois précédent")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyRange(currentMonthRange())}
              disabled={busy}
            >
              {t("venue.therapistInvoices.currentMonth", "Mois en cours")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyRange(nextMonthRange())}
              disabled={busy}
            >
              {t("venue.therapistInvoices.nextMonth", "Mois prochain")}
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-normal">
                {t("venue.therapistInvoices.periodStart", "Du")}
              </label>
              <Input
                type="date"
                value={range.start}
                onChange={(e) => applyRange({ ...range, start: e.target.value })}
                disabled={busy}
                className="w-[170px]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-normal">
                {t("venue.therapistInvoices.periodEnd", "Au")}
              </label>
              <Input
                type="date"
                value={range.end}
                onChange={(e) => applyRange({ ...range, end: e.target.value })}
                disabled={busy}
                className="w-[170px]"
              />
            </div>
            <Button onClick={() => runPreview()} disabled={busy}>
              {preview.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              {preview.isPending
                ? t("venue.therapistInvoices.previewing", "Calcul en cours…")
                : t("venue.therapistInvoices.preview", "Prévisualiser")}
            </Button>
          </div>

          {unfinalized.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-800">
                  {t(
                    "venue.therapistInvoices.unfinalized.warning",
                    "{{count}} réservation(s) payée(s) sur cette période ne sont pas finalisées et seront exclues des factures.",
                    { count: unfinalized.length },
                  )}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-amber-700 border-amber-300 bg-white hover:bg-amber-100 hover:text-amber-800"
                onClick={handleFinalize}
                disabled={busy}
              >
                {finalizing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCheck className="mr-2 h-4 w-4" />
                )}
                {t("venue.therapistInvoices.unfinalized.finalizeAll", "Les finaliser")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {preview.isPending ? (
        <Card>
          <CardContent className="space-y-3 py-6">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("venue.therapistInvoices.previewing", "Calcul en cours…")}
            </p>
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : !previewed ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              {t(
                "venue.therapistInvoices.notPreviewedYet",
                "Choisissez une période puis cliquez sur Prévisualiser",
              )}
            </p>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              {t(
                "venue.therapistInvoices.emptyPreview",
                "Aucun thérapeute à facturer sur cette période",
              )}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b px-4 py-3 text-sm">
            <span>
              {t("venue.therapistInvoices.summary.billable", "{{count}} thérapeute(s) à facturer", {
                count: billableCount,
              })}
            </span>
            {skippedCount > 0 && (
              <span className="text-muted-foreground">
                {t("venue.therapistInvoices.summary.skipped", "{{count}} ignoré(s)", {
                  count: skippedCount,
                })}
              </span>
            )}
            <span className="ml-auto text-muted-foreground">
              {t("venue.therapistInvoices.summary.totalHt", "Total HT sélectionné")} :{" "}
              <span className="tabular-nums">{formatAmount(totalHt)}</span>
            </span>
            <span>
              {t("venue.therapistInvoices.summary.totalTtc", "Total TTC sélectionné")} :{" "}
              <span className="tabular-nums">{formatAmount(totalTtc)}</span>
            </span>
          </div>

          <VenueTherapistInvoicePreviewTable
            rows={rows}
            range={range}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onPreviewHtml={handlePreviewHtml}
            onDownload={handleDownloadOne}
            previewingTherapistId={previewingTherapistId}
            disabled={busy}
          />

          <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3">
            <Button onClick={handleGenerateClick} disabled={busy || selectedRows.length === 0}>
              {isGenerating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              {isGenerating && progress
                ? t("venue.therapistInvoices.generating", "Génération {{done}}/{{total}}…", progress)
                : t(
                    "venue.therapistInvoices.generateSelected",
                    "Générer les factures sélectionnées ({{count}})",
                    { count: selectedRows.length },
                  )}
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadAll}
              disabled={busy || generatedRows.length === 0}
            >
              {downloadProgress ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {downloadProgress
                ? t(
                    "venue.therapistInvoices.downloading",
                    "Téléchargement {{done}}/{{total}}…",
                    downloadProgress,
                  )
                : t("venue.therapistInvoices.downloadAll", "Télécharger les PDF ({{count}})", {
                    count: generatedRows.length,
                  })}
            </Button>

            {(progress || downloadProgress) && (
              <Progress
                className="h-1.5 w-40"
                value={
                  ((progress ?? downloadProgress)!.done /
                    Math.max(1, (progress ?? downloadProgress)!.total)) *
                  100
                }
              />
            )}
          </div>
        </Card>
      )}

      {(issuedLoading || (issuedInvoices?.length ?? 0) > 0) && (
        <div className="space-y-2 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-normal">
              {t("venue.therapistInvoices.issued.title", "Factures thérapeutes émises")}
            </h3>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={issuedSearch}
                onChange={(e) => {
                  setIssuedSearch(e.target.value);
                  // Repartir de l'ouverture dérivée : les résultats d'une
                  // nouvelle recherche doivent être visibles sans un clic de plus.
                  setExpandedPeriods(null);
                }}
                placeholder={t(
                  "venue.therapistInvoices.issued.searchPlaceholder",
                  "Thérapeute ou numéro de facture",
                )}
                className="pl-8"
              />
            </div>
          </div>
          <Card>
            {issuedLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : issuedPeriods.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t(
                  "venue.therapistInvoices.issued.noSearchResult",
                  "Aucune facture ne correspond à cette recherche",
                )}
              </p>
            ) : (
              <Accordion
                type="multiple"
                value={openPeriods}
                onValueChange={setExpandedPeriods}
              >
                {issuedPeriods.map((period) => (
                  <AccordionItem key={period.key} value={period.key} className="last:border-b-0">
                    <AccordionTrigger className="px-4 hover:no-underline">
                      <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 pr-3 text-left">
                        <span>{period.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {t(
                            "venue.therapistInvoices.issued.invoiceCount",
                            "{{count}} facture(s)",
                            { count: period.invoices.length },
                          )}
                        </span>
                        <span className="ml-auto text-sm tabular-nums">
                          {formatAmount(period.totalTtc)}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>
                                {t("venue.therapistInvoices.columns.therapist", "Thérapeute")}
                              </TableHead>
                              <TableHead>
                                {t("venue.therapistInvoices.issued.columns.number", "Numéro")}
                              </TableHead>
                              <TableHead>
                                {t(
                                  "venue.therapistInvoices.issued.columns.generatedAt",
                                  "Générée le",
                                )}
                              </TableHead>
                              <TableHead className="text-right">
                                {t("venue.therapistInvoices.columns.totalHt", "Total HT")}
                              </TableHead>
                              <TableHead className="text-right">
                                {t("venue.therapistInvoices.columns.totalTtc", "Total TTC")}
                              </TableHead>
                              <TableHead className="w-[100px] text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {period.invoices.map((inv) => (
                              <TableRow key={inv.id}>
                                <TableCell>
                                  {[inv.therapists?.first_name, inv.therapists?.last_name]
                                    .filter(Boolean)
                                    .join(" ") || "—"}
                                </TableCell>
                                <TableCell className="font-mono text-xs">
                                  {inv.invoice_number}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground tabular-nums">
                                  {formatDateTimeFr(inv.generated_at ?? inv.created_at)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {formatAmount(inv.amount_ht)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {formatAmount(inv.amount_ttc)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => setIssuedPreview(inv)}
                                      disabled={!inv.html_snapshot}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() =>
                                        inv.html_snapshot &&
                                        downloadInvoicePdf(
                                          inv.html_snapshot,
                                          `${inv.invoice_number}.pdf`,
                                        )
                                      }
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
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </Card>
        </div>
      )}

      <AlertDialog open={confirmOverwrite} onOpenChange={setConfirmOverwrite}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-normal">
              {t("venue.therapistInvoices.overwrite.title", "Remplacer des factures existantes ?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "venue.therapistInvoices.overwrite.description",
                "{{count}} facture(s) existent déjà pour cette date de début et seront remplacées (le numéro est conservé) :",
                { count: overwrittenRows.length },
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {overwrittenRows.map((row) => (
              <li key={row.therapist_id} className="flex justify-between gap-2">
                <span className="truncate">{row.therapist_name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {row.existingInvoiceNumber}
                </span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Annuler")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                runGeneration();
              }}
            >
              {t("venue.therapistInvoices.overwrite.confirm", "Remplacer et générer")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {htmlPreview && (
        <InvoicePreviewDialog
          open={!!htmlPreview}
          onOpenChange={(open) => !open && setHtmlPreview(null)}
          invoiceHTML={htmlPreview.html}
          bookingId={null}
          isRoomPayment={false}
          title={htmlPreview.title}
          filename="apercu-facture.pdf"
        />
      )}

      {issuedPreview && (
        <InvoicePreviewDialog
          open={!!issuedPreview}
          onOpenChange={(open) => !open && setIssuedPreview(null)}
          invoiceHTML={issuedPreview.html_snapshot ?? ""}
          bookingId={null}
          isRoomPayment={false}
          title={`Facture ${issuedPreview.invoice_number}`}
          filename={`${issuedPreview.invoice_number}.pdf`}
          sendToTherapist={{
            invoiceId: issuedPreview.id,
            recipientEmail: issuedPreview.therapists?.email ?? null,
          }}
        />
      )}
    </div>
  );
}
