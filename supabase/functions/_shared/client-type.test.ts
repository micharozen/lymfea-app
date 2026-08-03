import { assertStrictEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

import { deriveClientFlowClientType } from "./client-type.ts";

// ---------------------------------------------------------------------------
// deriveClientFlowClientType — typologie d'une réservation du flow client public.
// Le flag vient de la case « je suis client de l'hôtel » (étape GuestInfo).
// ---------------------------------------------------------------------------

Deno.test("résident hôtel payant par carte → hotel", () => {
  // Le cas qui motivait le correctif : payer tout de suite plutôt que de
  // poster le soin sur la chambre ne fait pas du client un client externe.
  assertStrictEquals(deriveClientFlowClientType(true, "card"), "hotel");
});

Deno.test("résident hôtel payant sur la chambre → hotel", () => {
  assertStrictEquals(deriveClientFlowClientType(true, "room"), "hotel");
});

Deno.test("client de passage payant par carte → external", () => {
  assertStrictEquals(deriveClientFlowClientType(false, "card"), "external");
});

Deno.test("flag absent + paiement chambre → hotel (repli historique)", () => {
  // Onglet ouvert avant le déploiement, ou appel direct sans le flag.
  assertStrictEquals(deriveClientFlowClientType(undefined, "room"), "hotel");
});

Deno.test("flag absent + paiement carte → external", () => {
  assertStrictEquals(deriveClientFlowClientType(undefined, "card"), "external");
});

Deno.test("soin offert déclaré par un résident → hotel", () => {
  assertStrictEquals(deriveClientFlowClientType(true, "offert"), "hotel");
});
