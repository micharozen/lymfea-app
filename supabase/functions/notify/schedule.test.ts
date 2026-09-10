import { assertStrictEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

import { isBookingStarted } from "./schedule.ts";

// Le spa est à Paris (UTC+2 en été, UTC+1 en hiver) : c'est l'heure du lieu qui
// décide si le rendez-vous a commencé, jamais celle du serveur.
const PARIS = "Europe/Paris";

Deno.test("isBookingStarted — créneau à venir : on notifie", () => {
  // 10 sept. 2026 14:00 à Paris = 12:00 UTC. Il est 09:00 UTC.
  const now = new Date("2026-09-10T09:00:00Z");
  assertStrictEquals(isBookingStarted("2026-09-10", "14:00:00", PARIS, now), false);
});

Deno.test("isBookingStarted — créneau déjà commencé : on se tait", () => {
  // Il est 12:30 UTC, le soin de 14:00 Paris (12:00 UTC) a commencé.
  const now = new Date("2026-09-10T12:30:00Z");
  assertStrictEquals(isBookingStarted("2026-09-10", "14:00:00", PARIS, now), true);
});

Deno.test("isBookingStarted — la veille : on se tait", () => {
  const now = new Date("2026-09-10T09:00:00Z");
  assertStrictEquals(isBookingStarted("2026-09-09", "14:00:00", PARIS, now), true);
});

Deno.test("isBookingStarted — le lendemain : on notifie", () => {
  const now = new Date("2026-09-10T09:00:00Z");
  assertStrictEquals(isBookingStarted("2026-09-11", "09:00:00", PARIS, now), false);
});

Deno.test("isBookingStarted — début pile maintenant : compte comme commencé", () => {
  const now = new Date("2026-09-10T12:00:00Z");
  assertStrictEquals(isBookingStarted("2026-09-10", "14:00:00", PARIS, now), true);
});

Deno.test("isBookingStarted — le fuseau du lieu prime sur UTC", () => {
  // 08:30 UTC : à Paris il est 10:30, le soin de 10:00 a commencé. Interprété
  // en UTC (sans fuseau), il serait encore à venir.
  const now = new Date("2026-09-10T08:30:00Z");
  assertStrictEquals(isBookingStarted("2026-09-10", "10:00:00", PARIS, now), true);
  assertStrictEquals(isBookingStarted("2026-09-10", "10:00:00", "UTC", now), false);
});

Deno.test("isBookingStarted — heure d'hiver (UTC+1)", () => {
  // 15 janv. 2026 14:00 à Paris = 13:00 UTC.
  const now = new Date("2026-01-15T12:30:00Z");
  assertStrictEquals(isBookingStarted("2026-01-15", "14:00:00", PARIS, now), false);
  assertStrictEquals(
    isBookingStarted("2026-01-15", "14:00:00", PARIS, new Date("2026-01-15T13:30:00Z")),
    true,
  );
});

Deno.test("isBookingStarted — fuseau absent : repli UTC", () => {
  const now = new Date("2026-09-10T09:00:00Z");
  assertStrictEquals(isBookingStarted("2026-09-10", "14:00:00", null, now), false);
  assertStrictEquals(isBookingStarted("2026-09-10", "08:00:00", undefined, now), true);
});

Deno.test("isBookingStarted — date inexploitable : dans le doute on notifie", () => {
  const now = new Date("2026-09-10T09:00:00Z");
  assertStrictEquals(isBookingStarted("", "14:00:00", PARIS, now), false);
  assertStrictEquals(isBookingStarted("2026-09-10", "", PARIS, now), false);
  assertStrictEquals(isBookingStarted("pas-une-date", "14:00:00", PARIS, now), false);
});
