import { assertStrictEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  deriveClientFlowClientType,
  isDeferredBillingBooking,
  isRoomChargedBooking,
} from "./client-type.ts";

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

// ---------------------------------------------------------------------------
// isDeferredBillingBooking / isRoomChargedBooking — « le client a-t-il quelque
// chose à régler ? ». Le type de client ne suffit pas à trancher depuis qu'un
// résident hôtel peut payer par carte.
// ---------------------------------------------------------------------------

Deno.test("résident hôtel payé par carte : ni différé, ni facturé en chambre", () => {
  // Le cas critique : sans ça il recevrait « aucune démarche de paiement
  // nécessaire » et un SMS « facturation en chambre » après avoir été débité,
  // et son email de confirmation partirait sans attendre le paiement.
  const payment = { paymentMethod: "card", paymentStatus: "pending" };
  assertStrictEquals(isDeferredBillingBooking("hotel", payment), false);
  assertStrictEquals(isRoomChargedBooking("hotel", payment), false);
});

Deno.test("résident hôtel sur la note de chambre : différé", () => {
  const payment = { paymentMethod: "room", paymentStatus: "charged_to_room" };
  assertStrictEquals(isDeferredBillingBooking("hotel", payment), true);
  assertStrictEquals(isRoomChargedBooking("hotel", payment), true);
});

Deno.test("payment_status charged_to_room suffit sans payment_method", () => {
  const payment = { paymentMethod: null, paymentStatus: "charged_to_room" };
  assertStrictEquals(isRoomChargedBooking("hotel", payment), true);
});

Deno.test("partenaire : toujours différé, quel que soit le paiement", () => {
  for (const type of ["staycation", "classpass", "sezame"]) {
    assertStrictEquals(
      isDeferredBillingBooking(type, { paymentMethod: "card", paymentStatus: "pending" }),
      true,
    );
    // …mais jamais « facturé en chambre » : ce n'est pas un résident.
    assertStrictEquals(
      isRoomChargedBooking(type, { paymentMethod: "room", paymentStatus: "charged_to_room" }),
      false,
    );
  }
});

Deno.test("client externe : jamais différé", () => {
  assertStrictEquals(
    isDeferredBillingBooking("external", { paymentMethod: "room", paymentStatus: "charged_to_room" }),
    false,
  );
});
