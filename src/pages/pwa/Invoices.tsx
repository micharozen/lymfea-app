import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import {
  ChevronLeft,
  Download,
  FileText,
  Loader2,
  Share2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/formatPrice";
import { renderInvoicePdfBlob } from "@/lib/invoicePdf";
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

/**
 * Partage natif de fichiers (feuille iOS / Android). Sondé une seule fois avec
 * un PDF vide : `canShare` renvoie false pour les navigateurs qui exposent
 * `share` sans accepter de fichiers (Safari desktop, Firefox).
 */
const canShareFiles = (() => {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  try {
    return navigator.canShare({
      files: [new File([""], "probe.pdf", { type: "application/pdf" })],
    });
  } catch {
    return false;
  }
})();

/**
 * Largeur naturelle du document facture : `.document` fait 720px, le `body`
 * ajoute 48px de padding de chaque côté.
 */
const DOC_WIDTH = 816;

/**
 * Aperçu de la facture ramené à la largeur de l'écran.
 *
 * Le gabarit est en `table-layout: fixed` avec des colonnes en pixels : rendu
 * directement dans un iframe de 390px, les colonnes se chevauchent. On le rend
 * donc à sa largeur réelle et on le réduit — comme une visionneuse PDF — avec
 * un retour à 100% pour lire les lignes de détail.
 */
const ScaledInvoiceFrame = ({ html, title }: { html: string; title: string }) => {
  const { t } = useTranslation("pwa");
  const containerRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  const [actualSize, setActualSize] = useState(false);
  const [docHeight, setDocHeight] = useState(1200);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => setFitScale(Math.min(1, container.clientWidth / DOC_WIDTH));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  /**
   * Hauteur réelle du document. On mesure `body`, pas `documentElement` : ce
   * dernier est étiré à la hauteur de l'iframe, donc il renverrait la hauteur
   * qu'on vient de lui poser. Les polices distantes reflowent après le load,
   * d'où la seconde mesure.
   */
  const handleLoad = (event: React.SyntheticEvent<HTMLIFrameElement>) => {
    const doc = event.currentTarget.contentDocument;
    if (!doc) return;
    const measure = () => setDocHeight(doc.body.scrollHeight);
    measure();
    doc.fonts?.ready.then(measure).catch(() => {});
  };

  const scale = actualSize ? 1 : fitScale;

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={containerRef} className="h-full overflow-auto bg-white">
        <div style={{ width: DOC_WIDTH * scale, height: docHeight * scale }}>
          <iframe
            title={title}
            srcDoc={html}
            sandbox="allow-same-origin"
            scrolling="no"
            style={{
              width: DOC_WIDTH,
              height: docHeight,
              border: 0,
              display: "block",
              transform: `scale(${scale})`,
              transformOrigin: "0 0",
            }}
            onLoad={handleLoad}
          />
        </div>
      </div>

      {fitScale < 1 && (
        <button
          onClick={() => setActualSize((v) => !v)}
          aria-label={actualSize ? t("invoices.zoomFit") : t("invoices.zoomActual")}
          className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full border shadow-md"
          style={{ background: "var(--sand-50)", borderColor: "var(--line)", color: "var(--ink)" }}
        >
          {actualSize ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
        </button>
      )}
    </div>
  );
};

const PwaInvoices = () => {
  const { t, i18n } = useTranslation("pwa");
  const navigate = useNavigate();
  const dateLocale = i18n.language === "fr" ? fr : enUS;

  const { data: me } = useCurrentTherapist();
  const { data: invoices, isLoading } = useTherapistInvoices(me?.therapist?.id);

  const [preview, setPreview] = useState<TherapistInvoice | null>(null);
  const [pdf, setPdf] = useState<Blob | null>(null);

  const periodLabel = (invoice: TherapistInvoice) =>
    format(parseISO(invoice.period_start), "MMMM yyyy", { locale: dateLocale });

  /**
   * Le PDF est rendu dès l'ouverture de l'aperçu, pas au clic sur Partager :
   * iOS exige que `navigator.share()` parte d'un geste utilisateur encore
   * « frais », ce qu'un rendu html2canvas de plusieurs secondes ferait expirer.
   */
  useEffect(() => {
    if (!preview?.html_snapshot) {
      setPdf(null);
      return;
    }
    let cancelled = false;
    setPdf(null);
    renderInvoicePdfBlob(preview.html_snapshot, `${preview.invoice_number}.pdf`)
      .then((blob) => {
        if (!cancelled) setPdf(blob);
      })
      .catch((error) => {
        console.error("Error rendering invoice PDF:", error);
        if (!cancelled) toast.error(t("common:errors.generic"));
      });
    return () => {
      cancelled = true;
    };
  }, [preview, t]);

  const handleShare = async () => {
    if (!pdf || !preview) return;
    const file = new File([pdf], `${preview.invoice_number}.pdf`, {
      type: "application/pdf",
    });
    try {
      await navigator.share({ files: [file], title: preview.invoice_number });
    } catch (error) {
      // L'utilisateur qui referme la feuille de partage n'est pas une erreur.
      if ((error as Error)?.name === "AbortError") return;
      console.error("Error sharing invoice:", error);
      toast.error(t("common:errors.generic"));
    }
  };

  const handleDownload = () => {
    if (!pdf || !preview) return;
    const url = URL.createObjectURL(pdf);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${preview.invoice_number}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
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

          {preview.html_snapshot ? (
            <ScaledInvoiceFrame
              html={preview.html_snapshot}
              title={preview.invoice_number}
            />
          ) : (
            <div className="stat-empty flex flex-1 items-center justify-center gap-2">
              <FileText size={16} />
              {t("invoices.noDocument")}
            </div>
          )}

          {preview.html_snapshot && (
            <div
              style={{
                padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
                borderTop: "1px solid var(--line-soft)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <button
                className="btn-primary-lg"
                disabled={!pdf}
                onClick={canShareFiles ? handleShare : handleDownload}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                {!pdf ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : canShareFiles ? (
                  <Share2 size={18} />
                ) : (
                  <Download size={18} />
                )}
                {canShareFiles ? t("invoices.share") : t("invoices.download")}
              </button>
              {canShareFiles && (
                <button className="btn-ghost" disabled={!pdf} onClick={handleDownload}>
                  {t("invoices.download")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PwaInvoices;
