import { describe, it, expect } from "vitest";
import { addDays, subDays } from "date-fns";
import {
  dashboardWindow,
  extendWindowBack,
  historyWindow,
  planningWindow,
} from "./pwaBookingWindow";

const TODAY = new Date("2026-08-26T10:00:00");

describe("dashboardWindow", () => {
  it("spans J-7 → J+30", () => {
    expect(dashboardWindow(TODAY)).toEqual({ from: "2026-08-19", to: "2026-09-25" });
  });
});

describe("planningWindow", () => {
  // Le partage de cache entre le tableau de bord et l'agenda tient entièrement
  // à cette égalité stricte : si les bornes divergent d'un seul jour, les deux
  // écrans utilisent deux entrées de cache et refont chacun leur requête, sans
  // la moindre erreur pour le signaler.
  it("returns the dashboard bounds verbatim for today", () => {
    expect(planningWindow(TODAY, TODAY)).toEqual(dashboardWindow(TODAY));
  });

  it("reuses the dashboard bounds for every anchor whose visible span fits", () => {
    // Borne basse incluse (J-7), borne haute = J+30 moins les 3 jours visibles.
    for (const offset of [-7, -6, -1, 0, 1, 7, 14, 27]) {
      expect(planningWindow(addDays(TODAY, offset), TODAY)).toEqual(dashboardWindow(TODAY));
    }
  });

  it("snaps to the padded month once the visible span would fall outside", () => {
    expect(planningWindow(subDays(TODAY, 8), TODAY)).toEqual({
      from: "2026-07-25",
      to: "2026-09-07",
    });
    expect(planningWindow(addDays(TODAY, 28), TODAY)).toEqual({
      from: "2026-08-25",
      to: "2026-10-07",
    });
    expect(planningWindow(subDays(TODAY, 60), TODAY)).toEqual({
      from: "2026-05-25",
      to: "2026-07-07",
    });
  });

  it("keeps the same bounds across a whole month so the query key stops thrashing", () => {
    const anchor = new Date("2026-12-01T10:00:00");
    const first = planningWindow(anchor, TODAY);
    for (let day = 0; day < 31; day += 1) {
      expect(planningWindow(addDays(anchor, day), TODAY)).toEqual(first);
    }
    expect(first).toEqual({ from: "2026-11-24", to: "2027-01-07" });
  });
});

describe("historyWindow", () => {
  it("spans the last 90 days up to today", () => {
    expect(historyWindow(TODAY)).toEqual({ from: "2026-05-28", to: "2026-08-26" });
  });
});

describe("extendWindowBack", () => {
  it("widens towards the past and leaves the upper bound alone", () => {
    expect(extendWindowBack({ from: "2026-08-01", to: "2026-09-30" }, 1)).toEqual({
      from: "2026-07-01",
      to: "2026-09-30",
    });
  });

  it("keeps widening one month at a time from a padded bound", () => {
    expect(extendWindowBack({ from: "2026-11-24", to: "2027-01-07" }, 1)).toEqual({
      from: "2026-10-01",
      to: "2027-01-07",
    });
  });
});
