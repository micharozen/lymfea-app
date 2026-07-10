export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

const CSV_SEPARATOR = ";";

/**
 * Échappe un champ CSV (RFC 4180) : entoure de guillemets si le champ
 * contient le séparateur, une virgule, des guillemets ou un saut de ligne,
 * et double les guillemets internes.
 */
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[";,\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvField(c.header)).join(CSV_SEPARATOR);
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsvField(c.value(row))).join(CSV_SEPARATOR),
  );
  return [header, ...lines].join("\n");
}

/** Télécharge un CSV avec BOM UTF-8 pour qu'Excel détecte l'encodage. */
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Montant au format nombre FR (décimale virgule), compatible séparateur ";". */
export function formatCsvAmount(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return value.toFixed(2).replace(".", ",");
}
