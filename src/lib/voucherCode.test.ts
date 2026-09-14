import { describe, expect, it } from "vitest";

import { isUsableVoucherCode, normalizeVoucherCode } from "./voucherCode";

describe("normalizeVoucherCode", () => {
  it("ramène les variantes d'une même référence à une seule forme", () => {
    const forms = ["SMB 8812 3345", "smb-8812-3345", "SMB88123345", " smb 8812.3345 "];
    const normalized = forms.map(normalizeVoucherCode);
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe("SMB88123345");
  });

  it("conserve les chiffres et les lettres, retire tout le reste", () => {
    expect(normalizeVoucherCode("WB-4471-9920")).toBe("WB44719920");
    expect(normalizeVoucherCode("#GRP/2025_0077")).toBe("GRP20250077");
  });

  it("rend une chaîne vide pour une saisie sans caractère exploitable", () => {
    expect(normalizeVoucherCode("---")).toBe("");
    expect(normalizeVoucherCode("")).toBe("");
  });
});

describe("isUsableVoucherCode", () => {
  it("accepte une référence d'au moins 4 caractères significatifs", () => {
    expect(isUsableVoucherCode("WB-1")).toBe(false);
    expect(isUsableVoucherCode("WB-12")).toBe(true);
    expect(isUsableVoucherCode("WB-4471-9920")).toBe(true);
  });

  it("ne compte pas les séparateurs dans la longueur", () => {
    expect(isUsableVoucherCode("A-B-C")).toBe(false);
  });
});
