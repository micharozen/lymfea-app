/**
 * Rendu PDF des documents HTML (factures, rapports de clôture).
 *
 * html2pdf injecte un élément dans le `<body>` puis le capture via html2canvas :
 * deux rendus concurrents se marchent dessus. Toutes les fonctions de ce module
 * sont donc strictement séquentielles, et nettoient l'élément injecté même en
 * cas d'échec.
 */

interface PdfOptions {
  /** Certains documents chargent des images distantes (logos) et exigent CORS. */
  useCors?: boolean;
}

const pdfConfig = (filename: string, options?: PdfOptions) => ({
  margin: 0,
  filename,
  image: { type: "jpeg", quality: 0.98 },
  html2canvas: { scale: 2, letterRendering: true, useCORS: options?.useCors ?? false },
  jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
});

/** Monte le HTML hors écran, exécute `run`, puis démonte quoi qu'il arrive. */
async function withMountedHtml<T>(
  html: string,
  run: (element: HTMLElement) => Promise<T>,
): Promise<T> {
  const element = document.createElement("div");
  element.innerHTML = html;
  document.body.appendChild(element);
  try {
    return await run(element);
  } finally {
    element.remove();
  }
}

/** Génère le PDF et déclenche son téléchargement. */
export async function downloadInvoicePdf(
  html: string,
  filename: string,
  options?: PdfOptions,
): Promise<void> {
  const html2pdf = (await import("html2pdf.js")).default;
  await withMountedHtml(html, (element) =>
    html2pdf().set(pdfConfig(filename, options)).from(element).save(),
  );
}

/** Génère le PDF et renvoie son blob, pour le partage natif ou un lien objet. */
export async function renderInvoicePdfBlob(
  html: string,
  filename: string,
  options?: PdfOptions,
): Promise<Blob> {
  const html2pdf = (await import("html2pdf.js")).default;
  return withMountedHtml(html, (element) =>
    html2pdf().set(pdfConfig(filename, options)).from(element).outputPdf("blob"),
  );
}

/** Génère le PDF et renvoie son base64 (sans le préfixe data-URI). */
export async function renderInvoicePdfBase64(
  html: string,
  filename: string,
  options?: PdfOptions,
): Promise<string> {
  const html2pdf = (await import("html2pdf.js")).default;
  return withMountedHtml(html, async (element) => {
    const dataUri: string = await html2pdf()
      .set(pdfConfig(filename, options))
      .from(element)
      .outputPdf("datauristring");
    return dataUri.split(",")[1] ?? "";
  });
}

/**
 * Télécharge une série de PDF, un par un. L'espacement évite que le navigateur
 * bloque les téléchargements multiples rapprochés. Un échec unitaire n'arrête
 * pas le lot.
 */
export async function downloadInvoicePdfBatch(
  items: Array<{ html: string; filename: string }>,
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;

  for (const [index, item] of items.entries()) {
    try {
      await downloadInvoicePdf(item.html, item.filename);
      ok += 1;
    } catch (err) {
      console.error(`[invoicePdf] échec du PDF ${item.filename}:`, err);
      failed += 1;
    }
    onProgress?.(index + 1, items.length);
    if (index < items.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  return { ok, failed };
}
