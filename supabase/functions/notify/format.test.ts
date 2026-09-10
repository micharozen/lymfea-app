import { assertStrictEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

import { shortTime, slotTransition } from "./format.ts";

Deno.test("shortTime — tronque les secondes", () => {
  assertStrictEquals(shortTime("14:00:00"), "14:00");
  assertStrictEquals(shortTime("09:30"), "09:30");
  assertStrictEquals(shortTime(null), "");
});

Deno.test("slotTransition — sans créneau d'origine : le nouveau créneau seul", () => {
  const result = slotTransition(null, { date: "2026-09-10", time: "16:00:00" });
  assertStrictEquals(result, "jeu. 10 sept. à 16:00");
});

Deno.test("slotTransition — heure déplacée : la date n'est pas répétée", () => {
  const result = slotTransition(
    { date: "2026-09-10", time: "14:00:00" },
    { date: "2026-09-10", time: "16:00:00" },
  );
  assertStrictEquals(result, "jeu. 10 sept. 14:00 → 16:00");
});

Deno.test("slotTransition — date déplacée : les deux créneaux en entier", () => {
  const result = slotTransition(
    { date: "2026-09-10", time: "14:00:00" },
    { date: "2026-09-11", time: "16:00:00" },
  );
  assertStrictEquals(result, "jeu. 10 sept. 14:00 → ven. 11 sept. 16:00");
});

Deno.test("slotTransition — date déplacée à heure constante", () => {
  const result = slotTransition(
    { date: "2026-09-10", time: "14:00:00" },
    { date: "2026-09-11", time: "14:00:00" },
  );
  assertStrictEquals(result, "jeu. 10 sept. 14:00 → ven. 11 sept. 14:00");
});

Deno.test("slotTransition — créneau inchangé : pas de flèche trompeuse", () => {
  // Cas des soins modifiés sans déplacement : afficher « 14:00 → 14:00 »
  // laisserait croire à un changement d'horaire.
  const result = slotTransition(
    { date: "2026-09-10", time: "14:00:00" },
    { date: "2026-09-10", time: "14:00:00" },
  );
  assertStrictEquals(result, "jeu. 10 sept. à 14:00");
});

Deno.test("slotTransition — secondes ignorées dans la comparaison", () => {
  const result = slotTransition(
    { date: "2026-09-10", time: "14:00" },
    { date: "2026-09-10", time: "14:00:00" },
  );
  assertStrictEquals(result, "jeu. 10 sept. à 14:00");
});

Deno.test("slotTransition — créneau d'origine incomplet : repli sur le nouveau", () => {
  assertStrictEquals(
    slotTransition({ date: "2026-09-10" }, { date: "2026-09-11", time: "16:00:00" }),
    "ven. 11 sept. à 16:00",
  );
});
