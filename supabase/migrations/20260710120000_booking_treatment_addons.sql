-- Materialise the "add-on" nature of a booking line.
--
-- Until now an add-on (a supplement proposed on top of a soin in the client
-- flow) landed in booking_treatments as a row strictly identical to a real
-- soin. Two consequences:
--   * computeDuoLegs detects a combo-duo with `treatments.length = guest_count`,
--     so a duo with an add-on had 3 rows for 2 guests and was misread as a
--     shared-duo: both therapists were paid on treatments[0] and the add-on was
--     paid to nobody.
--   * nothing tied the add-on to the soin it extends, so it could not follow its
--     therapist.
--
-- The unit of attribution is the LEG: one base soin + the add-ons hanging off
-- it. `is_addon` keeps add-ons out of the guest-soin count; the parent link
-- decides which leg — hence which therapist and which duration — an add-on
-- belongs to. An add-on with no parent (its parent was removed from the cart)
-- is an orphan and follows the first therapist to accept.
--
-- No backfill: existing rows stay is_addon = false, reproducing today's exact
-- behaviour.

ALTER TABLE "public"."booking_treatments"
  ADD COLUMN "is_addon" boolean NOT NULL DEFAULT false,
  ADD COLUMN "parent_booking_treatment_id" "uuid"
    REFERENCES "public"."booking_treatments"("id") ON DELETE CASCADE;

-- A parent link only ever hangs off an add-on, and an add-on is never its own parent.
ALTER TABLE "public"."booking_treatments"
  ADD CONSTRAINT "booking_treatments_parent_requires_addon"
    CHECK ("parent_booking_treatment_id" IS NULL OR "is_addon"),
  ADD CONSTRAINT "booking_treatments_parent_not_self"
    CHECK ("parent_booking_treatment_id" IS DISTINCT FROM "id");

CREATE INDEX "idx_booking_treatments_parent"
  ON "public"."booking_treatments" USING "btree" ("parent_booking_treatment_id")
  WHERE "parent_booking_treatment_id" IS NOT NULL;

COMMENT ON COLUMN "public"."booking_treatments"."is_addon" IS
  'True when the line is a supplement, not one of the guests'' soins. Excluded from the combo-duo detection (see _shared/duoLegs.ts).';

COMMENT ON COLUMN "public"."booking_treatments"."parent_booking_treatment_id" IS
  'The base soin this add-on extends. Defines the leg it belongs to: accept_booking assigns an add-on to whoever claims its parent. NULL = orphan, follows the first accepter.';
