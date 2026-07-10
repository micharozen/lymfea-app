import { describe, it, expect } from "vitest";
import { escapeCsvField, buildCsv, formatCsvAmount, type CsvColumn } from "./csvExport";

describe("escapeCsvField", () => {
  it("returns empty string for null/undefined", () => {
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
  });

  it("returns plain values unchanged", () => {
    expect(escapeCsvField("Massage suédois")).toBe("Massage suédois");
    expect(escapeCsvField(42)).toBe("42");
  });

  it("quotes fields containing the separator", () => {
    expect(escapeCsvField("Soin; visage")).toBe('"Soin; visage"');
  });

  it("quotes fields containing a comma", () => {
    expect(escapeCsvField("Massage, duo")).toBe('"Massage, duo"');
  });

  it("doubles internal quotes", () => {
    expect(escapeCsvField('Soin "signature"')).toBe('"Soin ""signature"""');
  });

  it("quotes fields containing newlines", () => {
    expect(escapeCsvField("ligne1\nligne2")).toBe('"ligne1\nligne2"');
  });
});

describe("buildCsv", () => {
  interface Row {
    name: string;
    amount: number | null;
  }

  const columns: CsvColumn<Row>[] = [
    { header: "Nom", value: (r) => r.name },
    { header: "Montant", value: (r) => formatCsvAmount(r.amount) },
  ];

  it("builds header + rows with ; separator (decimal comma gets quoted)", () => {
    const csv = buildCsv([{ name: "Alice", amount: 12.5 }], columns);
    expect(csv).toBe('Nom;Montant\nAlice;"12,50"');
  });

  it("escapes fields per row", () => {
    const csv = buildCsv([{ name: "Massage, duo", amount: null }], columns);
    expect(csv).toBe('Nom;Montant\n"Massage, duo";');
  });

  it("handles empty rows", () => {
    expect(buildCsv([], columns)).toBe("Nom;Montant");
  });
});

describe("formatCsvAmount", () => {
  it("formats with comma decimal", () => {
    expect(formatCsvAmount(1234.5)).toBe("1234,50");
    expect(formatCsvAmount(0)).toBe("0,00");
  });

  it("returns empty string for null/undefined", () => {
    expect(formatCsvAmount(null)).toBe("");
    expect(formatCsvAmount(undefined)).toBe("");
  });
});
