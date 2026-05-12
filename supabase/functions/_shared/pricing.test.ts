import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  computePricing,
  type TreatmentPayloadItem,
  type TreatmentRow,
  validateTreatments,
  type VariantRow,
} from "./pricing.ts";

const HOTEL = "hotel-1";

function makeTreatment(over: Partial<TreatmentRow> = {}): TreatmentRow {
  return {
    id: "t1",
    hotel_id: HOTEL,
    status: "active",
    price: 100,
    duration: 60,
    ...over,
  };
}

Deno.test("validateTreatments: empty payload → MISSING_TREATMENTS", () => {
  const result = validateTreatments([], [], [], HOTEL);
  assertEquals(result?.code, "MISSING_TREATMENTS");
});

Deno.test("validateTreatments: payload references unknown treatment → OUTDATED_CART", () => {
  const payload: TreatmentPayloadItem[] = [{ treatmentId: "missing" }];
  const result = validateTreatments(payload, [], [], HOTEL);
  assertEquals(result?.code, "OUTDATED_CART");
});

Deno.test("validateTreatments: treatment from another venue → INACTIVE_OR_FOREIGN", () => {
  const t = makeTreatment({ hotel_id: "other-hotel" });
  const result = validateTreatments(
    [{ treatmentId: t.id }],
    [t],
    [],
    HOTEL,
  );
  assertEquals(result?.code, "INACTIVE_OR_FOREIGN");
});

Deno.test("validateTreatments: inactive treatment → INACTIVE_OR_FOREIGN", () => {
  const t = makeTreatment({ status: "draft" });
  const result = validateTreatments(
    [{ treatmentId: t.id }],
    [t],
    [],
    HOTEL,
  );
  assertEquals(result?.code, "INACTIVE_OR_FOREIGN");
});

Deno.test("validateTreatments: global treatment (hotel_id null) is allowed", () => {
  const t = makeTreatment({ hotel_id: null, status: "Actif" });
  const result = validateTreatments(
    [{ treatmentId: t.id }],
    [t],
    [],
    HOTEL,
  );
  assertStrictEquals(result, null);
});

Deno.test("validateTreatments: missing variant → MISSING_VARIANT", () => {
  const t = makeTreatment();
  const result = validateTreatments(
    [{ treatmentId: t.id, variantId: "v-missing" }],
    [t],
    [],
    HOTEL,
  );
  assertEquals(result?.code, "MISSING_VARIANT");
});

Deno.test("validateTreatments: happy path returns null", () => {
  const t = makeTreatment();
  const v: VariantRow = { id: "v1", price: 120, duration: 75 };
  const result = validateTreatments(
    [{ treatmentId: t.id, variantId: v.id }],
    [t],
    [v],
    HOTEL,
  );
  assertStrictEquals(result, null);
});

Deno.test("computePricing: sums base prices and durations", () => {
  const t1 = makeTreatment({ id: "t1", price: 100, duration: 60 });
  const t2 = makeTreatment({ id: "t2", price: 50, duration: 30 });
  const result = computePricing(
    [{ treatmentId: "t1" }, { treatmentId: "t2" }],
    [t1, t2],
    [],
  );
  assertEquals(result.rawTotalPrice, 150);
  assertEquals(result.totalDuration, 90);
  assertEquals(result.verifiedTotalPrice, 150);
});

Deno.test("computePricing: variant price/duration overrides base", () => {
  const t = makeTreatment({ price: 100, duration: 60 });
  const v: VariantRow = { id: "v1", price: 180, duration: 90 };
  const result = computePricing(
    [{ treatmentId: t.id, variantId: v.id }],
    [t],
    [v],
  );
  assertEquals(result.rawTotalPrice, 180);
  assertEquals(result.totalDuration, 90);
});

Deno.test("computePricing: variant null fields fall back to base", () => {
  const t = makeTreatment({ price: 100, duration: 60 });
  const v: VariantRow = { id: "v1", price: null, duration: null };
  const result = computePricing(
    [{ treatmentId: t.id, variantId: v.id }],
    [t],
    [v],
  );
  assertEquals(result.rawTotalPrice, 100);
  assertEquals(result.totalDuration, 60);
});

Deno.test("computePricing: missing duration on both → defaults to 30", () => {
  const t = makeTreatment({ price: 100, duration: null });
  const result = computePricing([{ treatmentId: t.id }], [t], []);
  assertEquals(result.totalDuration, 30);
});

Deno.test("computePricing: gift card deducts from total, never below zero", () => {
  const t = makeTreatment({ price: 100, duration: 60 });
  const r1 = computePricing(
    [{ treatmentId: t.id }],
    [t],
    [],
    { amountCents: 3000 },
  );
  assertEquals(r1.giftDeductionEuros, 30);
  assertEquals(r1.verifiedTotalPrice, 70);

  const r2 = computePricing(
    [{ treatmentId: t.id }],
    [t],
    [],
    { amountCents: 50000 },
  );
  assertEquals(r2.verifiedTotalPrice, 0);
});

Deno.test("computePricing: payload uses 'id' field as fallback for treatmentId", () => {
  const t = makeTreatment({ id: "t1", price: 42, duration: 45 });
  const result = computePricing([{ id: "t1" }], [t], []);
  assertEquals(result.rawTotalPrice, 42);
  assertEquals(result.totalDuration, 45);
});
