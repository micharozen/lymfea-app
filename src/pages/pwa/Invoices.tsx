import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { ChevronLeft, Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/formatPrice";
import { downloadInvoicePdf } from "@/lib/invoicePdf";
import { useCurrentTherapist } from "@/hooks/pwa/useCurrentTherapist";
import {
  useTherapistInvoices,
  type TherapistInvoice,
} from "@/hooks/pwa/useTherapistInvoices";

/** Les factures sont émises par le lieu : la PWA ne fait que les consulter. */
const statusTone: Record<string, string> = {
  issued: "info",
  paid: "ok",
  cancelled: "warn",
};

const PwaInvoices = () => {
  const { t, i18n } = useTranslation("pwa");
  const navigate = useNavigate();
  const dateLocale = i18n.language === "fr" ? fr : enUS;

  const { data: me } = useCurrentTherapist();
  const { data: invoices, isLoading } = useTherapistInvoices(me?.therapist?.id);

  const [preview, setPreview] = useState<TherapistInvoice | null>(null);
  const [downloading, setDownloading] = useState(false);

  const periodLabel = (invoice: TherapistInvoice) =>
    format(parseISO(invoice.period_start), "MMMM yyyy", { locale: dateLocale });

  const handleDownload = async (invoice: TherapistInvoice) => {
    if (!invoice.html_snapshot) return;
    setDownloading(true);
    try {
      await downloadInvoicePdf(invoice.html_snapshot, `${invoice.invoice_number}.pdf`);
    } catch (error) {
      console.error("Error downloading invoice:", error);
      toast.error(t("common:errors.generic"));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="app-refonte flex h-full min-h-0 flex-col">
      <header className="hdr" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
        <button
          className="back-btn"
          onClick={() => navigate("/pwa/profile")}
          aria-label={t("common:buttons.back")}
        >
          <ChevronLeft size={18} />
        </button>
        <span style={{ fontSize: 18, fontWeight: 400 }}>{t("invoices.title")}</span>
        <div className="spacer" />
      </header>

      <div className="app-scroll" style={{ paddingBottom: 24 }}>
        {isLoading ? (
          <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="sk" style={{ height: 76, borderRadius: 18 }} />
            <div className="sk" style={{ height: 76, borderRadius: 18 }} />
            <div className="sk" style={{ height: 76, borderRadius: 18 }} />
          </div>
        ) : !invoices?.length ? (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="stat-empty">{t("invoices.empty")}</div>
          </div>
        ) : (
          <>
            <div className="sec-label">
              {t("invoices.sectionLabel")}
              <span className="count">{invoices.length}</span>
            </div>
            <div className="card">
              {invoices.map((invoice) => (
                <button
                  key={invoice.id}
                  className="stat-row"
                  style={{ width: "100%", background: "none", border: "none", textAlign: "left" }}
                  onClick={() => setPreview(invoice)}
                >
                  <div className="tx">
                    <div className="t" style={{ textTransform: "capitalize" }}>
                      {periodLabel(invoice)}
                    </div>
                    <div className="s">
                      {invoice.hotel_name ?? "—"} · {invoice.invoice_number}
                    </div>
                  </div>
                  <div className="amt">
                    <div className="v">{formatPrice(invoice.amount_ttc, invoice.currency)}</div>
                    <div className="of">
                      <span className={`status ${statusTone[invoice.status] ?? "info"}`}>
                        {t(`invoices.status.${invoice.status}`, invoice.status)}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <p
              style={{
                margin: "calc(12px * var(--sp)) 20px 0",
                fontSize: 12,
                color: "var(--ink-mute)",
                lineHeight: 1.5,
              }}
            >
              {t("invoices.readOnlyHint")}
            </p>
          </>
        )}
      </div>

      {/* Aperçu plein écran — le HTML figé à la génération, tel quel. */}
      {preview && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-background">
          <header className="hdr" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
            <button
              className="back-btn"
              onClick={() => setPreview(null)}
              aria-label={t("common:buttons.back")}
            >
              <ChevronLeft size={18} />
            </button>
            <span style={{ fontSize: 15, fontWeight: 400 }}>{preview.invoice_number}</span>
            <div className="spacer" />
          </header>

          <div className="flex-1 min-h-0 bg-white">
            {preview.html_snapshot ? (
              <iframe
                title={preview.invoice_number}
                srcDoc={preview.html_snapshot}
                sandbox="allow-same-origin"
                className="w-full h-full border-0"
              />
            ) : (
              <div className="stat-empty flex h-full items-center justify-center gap-2">
                <FileText size={16} />
                {t("invoices.noDocument")}
              </div>
            )}
          </div>

          <div
            style={{
              padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
              borderTop: "1px solid var(--line-soft)",
            }}
          >
            <button
              className="btn-primary-lg"
              disabled={!preview.html_snapshot || downloading}
              onClick={() => handleDownload(preview)}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              {downloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
              {t("invoices.download")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PwaInvoices;
