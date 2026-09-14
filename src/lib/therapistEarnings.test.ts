import { describe, it, expect } from "vitest";
import {
  computeTherapistEarnings,
  computeLegEarnings,
  computeLegEarningsDetailed,
  type TreatmentRateMap,
} from "./therapistEarnings";

const rates = { rate_60: 30, rate_75: 45, rate_90: 60 };

describe("computeTherapistEarnings — out-of-hours surcharge", () => {
  it("returns the base rate when no surcharge is passed", () => {
    expect(computeTherapistEarnings(rates, 60)).toBe(30);
  });

  it("returns the base rate when surcharge is 0", () => {
    expect(computeTherapistEarnings(rates, 60, { surchargePercent: 0 })).toBe(30);
  });

  it("uplifts the earning by the surcharge percent (20% → ×1.2)", () => {
    expect(computeTherapistEarnings(rates, 60, { surchargePercent: 20 })).toBe(36);
  });

  it("applies the surcharge to interpolated durations too", () => {
    // 90 min → rate_90 = 60, +20% = 72
    expect(computeTherapistEarnings(rates, 90, { surchargePercent: 20 })).toBe(72);
  });

  it("ignores negative surcharge percents", () => {
    expect(computeTherapistEarnings(rates, 60, { surchargePercent: -50 })).toBe(30);
  });

  it("returns null when rates are missing", () => {
    expect(computeTherapistEarnings(null, 60, { surchargePercent: 20 })).toBeNull();
  });
});

describe("computeTherapistEarnings — extra duration brackets", () => {
  const extended = {
    rate_45: 24,
    rate_60: 30,
    rate_75: 45,
    rate_90: 60,
    rate_120: 84,
    rate_150: 105,
  };

  it("uses an exact configured bracket (120 min)", () => {
    expect(computeTherapistEarnings(extended, 120)).toBe(84);
  });

  it("uses the smallest configured bracket exactly (45 min)", () => {
    expect(computeTherapistEarnings(extended, 45)).toBe(24);
  });

  it("interpolates between two configured brackets (105 min → 90↔120)", () => {
    // 90→60, 120→84, midpoint 105 = 72
    expect(computeTherapistEarnings(extended, 105)).toBe(72);
  });

  it("interpolates using a newly added bracket instead of extrapolating (135 min)", () => {
    // 120→84, 150→105, midpoint 135 = 94.5
    expect(computeTherapistEarnings(extended, 135)).toBe(94.5);
  });

  it("pro-rata below the smallest configured bracket (30 min from rate_45)", () => {
    // (24 / 45) * 30 = 16
    expect(computeTherapistEarnings(extended, 30)).toBe(16);
  });

  it("uses rate_30 exactly instead of the pro-rata from rate_45", () => {
    // Sans rate_30, 30 min valaient (24/45)*30 = 16 ; le palier renseigné prime.
    expect(computeTherapistEarnings({ ...extended, rate_30: 20 }, 30)).toBe(20);
  });

  it("interpolates between rate_30 and rate_45 (une durée intermédiaire)", () => {
    // 30→20, 45→24 : 40 min = 20 + 4 × (10/15) ≈ 22.67
    expect(computeTherapistEarnings({ ...extended, rate_30: 20 }, 40)).toBeCloseTo(22.67, 2);
  });

  it("pro-rata sous rate_30 quand c'est le plus petit palier (15 min)", () => {
    // (20 / 30) * 15 = 10
    expect(computeTherapistEarnings({ ...extended, rate_30: 20 }, 15)).toBe(10);
  });

  it("laisse le calcul inchangé tant que rate_30 est nul", () => {
    expect(computeTherapistEarnings({ ...extended, rate_30: null }, 30)).toBe(16);
  });

  it("keeps the legacy 60/75/90 behaviour when no extra brackets are set", () => {
    const legacy = { rate_60: 30, rate_75: 45, rate_90: 60 };
    // >90 extrapolates from rate_90: (60/90)*120 = 80
    expect(computeTherapistEarnings(legacy, 120)).toBe(80);
  });
});

describe("computeLegEarnings — non-régression sans barème spécifique", () => {
  // Toute jambe sans barème applicable doit valoir exactement l'ancien calcul :
  // c'est ce qui garantit qu'aucun payout ni aucune facture existante ne bouge.
  const cases: Array<[string, number, { surchargePercent?: number } | undefined]> = [
    ["60 min sans majoration", 60, undefined],
    ["60 min majoré à 20 %", 60, { surchargePercent: 20 }],
    ["90 min majoré à 20 %", 90, { surchargePercent: 20 }],
    ["135 min extrapolé", 135, undefined],
    ["30 min au prorata", 30, undefined],
  ];

  for (const [label, duration, options] of cases) {
    it(`vaut computeTherapistEarnings — ${label}`, () => {
      const expected = computeTherapistEarnings(rates, duration, options);
      expect(computeLegEarnings(rates, null, { totalDuration: duration }, options)).toBe(expected);
      expect(computeLegEarnings(rates, {}, { totalDuration: duration, lines: [] }, options)).toBe(
        expected,
      );
    });
  }

  it("ignore une map qui ne correspond à aucune ligne de la jambe", () => {
    const map: TreatmentRateMap = { "autre-soin": { "60": 90 } };
    const leg = { totalDuration: 60, lines: [{ treatment_id: "massage", duration: 60 }] };
    expect(computeLegEarnings(rates, map, leg)).toBe(30);
  });

  it("ignore un barème dont tous les paliers sont vides ou nuls", () => {
    const map: TreatmentRateMap = { manucure: { "60": 0 } };
    const leg = { totalDuration: 60, lines: [{ treatment_id: "manucure", duration: 60 }] };
    expect(computeLegEarnings(rates, map, leg)).toBe(30);
  });

  it("ignore la map quand le thérapeute a le flag désactivé (null passé à la lecture)", () => {
    const leg = { totalDuration: 60, lines: [{ treatment_id: "manucure", duration: 60 }] };
    expect(computeLegEarnings(rates, null, leg)).toBe(30);
  });

  it("ne signale pas de taux spécifique", () => {
    const leg = { totalDuration: 60, lines: [{ treatment_id: "massage", duration: 60 }] };
    expect(computeLegEarningsDetailed(rates, {}, leg).usedTreatmentRate).toBe(false);
  });
});

describe("computeLegEarnings — barème spécifique par soin", () => {
  const map: TreatmentRateMap = {
    manucure: { "60": 20, "90": 26 },
    reflexo: { "60": 50 },
  };

  it("paie la ligne surchargée à son propre barème, le défaut est ignoré", () => {
    const leg = { totalDuration: 60, lines: [{ treatment_id: "manucure", duration: 60 }] };
    expect(computeLegEarnings(rates, map, leg)).toBe(20);
  });

  it("signale l'usage d'un taux spécifique", () => {
    const leg = { totalDuration: 60, lines: [{ treatment_id: "manucure", duration: 60 }] };
    expect(computeLegEarningsDetailed(rates, map, leg).usedTreatmentRate).toBe(true);
  });

  it("interpole entre les paliers du soin, pas ceux du défaut", () => {
    // manucure 60→20, 90→26, milieu 75 = 23 (le défaut donnerait 45)
    const leg = { totalDuration: 75, lines: [{ treatment_id: "manucure", duration: 75 }] };
    expect(computeLegEarnings(rates, map, leg)).toBe(23);
  });

  it("reste auto-suffisant avec un palier unique — prorata, sans retomber sur le défaut", () => {
    // reflexo n'a que 60→50 : 90 min extrapole à (50/60)*90 = 75
    const leg = { totalDuration: 90, lines: [{ treatment_id: "reflexo", duration: 90 }] };
    expect(computeLegEarnings(rates, map, leg)).toBe(75);
  });

  it("mixte : la ligne surchargée sort du lot, le reste garde le barème par défaut", () => {
    // manucure 60 = 20 ; l'add-on de 30 min repart sur le défaut au prorata
    // ((30/60)*30 = 15) et NON sur le palier 90 du barème par défaut.
    const leg = {
      totalDuration: 90,
      lines: [
        { treatment_id: "manucure", duration: 60 },
        { treatment_id: "gommage", duration: 30 },
      ],
    };
    expect(computeLegEarnings(rates, map, leg)).toBe(35);
    expect(computeTherapistEarnings(rates, 90)).toBe(60); // ce que valait l'ancien calcul
  });

  it("applique la majoration hors horaires au total combiné", () => {
    const leg = {
      totalDuration: 90,
      lines: [
        { treatment_id: "manucure", duration: 60 },
        { treatment_id: "gommage", duration: 30 },
      ],
    };
    expect(computeLegEarnings(rates, map, leg, { surchargePercent: 20 })).toBe(42);
  });

  it("paie sans barème par défaut quand toute la jambe est surchargée", () => {
    const leg = { totalDuration: 60, lines: [{ treatment_id: "manucure", duration: 60 }] };
    expect(computeLegEarnings(null, map, leg)).toBe(20);
  });

  it("renvoie null quand le reste non surchargé n'a pas de barème par défaut", () => {
    const leg = {
      totalDuration: 90,
      lines: [
        { treatment_id: "manucure", duration: 60 },
        { treatment_id: "gommage", duration: 30 },
      ],
    };
    expect(computeLegEarnings(null, map, leg)).toBeNull();
  });

  it("neutralise un totalDuration incohérent plutôt que de payer en négatif", () => {
    // La clôture passe bookings.duration, qui peut être plus court que ses lignes.
    const leg = { totalDuration: 30, lines: [{ treatment_id: "manucure", duration: 60 }] };
    expect(computeLegEarnings(rates, map, leg)).toBe(20);
  });

  it("additionne plusieurs lignes surchargées", () => {
    const leg = {
      totalDuration: 120,
      lines: [
        { treatment_id: "manucure", duration: 60 },
        { treatment_id: "reflexo", duration: 60 },
      ],
    };
    expect(computeLegEarnings(rates, map, leg)).toBe(70);
  });
});
