/**
 * Weighted completeness scoring for a venue's booking-flow configuration.
 *
 * Pure, UI-agnostic logic: given the current form values plus a couple of
 * derived flags (payment provider connected, deployment schedule configured),
 * it returns a percentage and a per-item checklist. Weights and predicates are
 * grouped here so they can be tuned in one place.
 *
 * Scope: only the settings that impact the client booking flow (payment mode,
 * payment connection, opening hours, out-of-hours surcharge, deployment
 * schedule, hold, min notice, commissions).
 */

export type VenueCheckStatus = "ok" | "missing" | "na";

/** A single scored check (no label — the hook/UI resolves i18n labels). */
export interface VenueCheckState {
  id: string;
  weight: number;
  status: VenueCheckStatus;
  /** DOM id of the config section to scroll to (see VENUE_CONFIG_SECTIONS). */
  sectionId: string;
}

/** Subset of the venue form values needed to score completeness. */
export interface VenueCompletenessValues {
  opening_time?: string | null;
  closing_time?: string | null;
  hotel_commission?: string | null;
  therapist_commission?: string | null;
  client_payment_mode?: string | null;
  allow_out_of_hours_booking?: boolean;
  out_of_hours_surcharge_percent?: string | null;
  booking_hold_enabled?: boolean;
  booking_hold_duration_minutes?: number | null;
  min_booking_notice_minutes?: number | null;
}

export interface VenueCompletenessInput {
  values: VenueCompletenessValues;
  paymentConnected: boolean;
  hasDeploymentSchedule: boolean;
}

const hasText = (v?: string | null): boolean => typeof v === "string" && v.trim() !== "";

const toNumber = (v?: string | number | null): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
};

/**
 * Compute the weighted completeness of a venue's booking-flow configuration.
 * `na` items are excluded from both numerator and denominator.
 */
export function computeVenueCompleteness(
  input: VenueCompletenessInput,
): { percent: number; items: VenueCheckState[] } {
  const { values, paymentConnected, hasDeploymentSchedule } = input;

  const items: VenueCheckState[] = [
    {
      id: "opening_hours",
      weight: 3,
      sectionId: "schedule",
      status: hasText(values.opening_time) && hasText(values.closing_time) ? "ok" : "missing",
    },
    {
      id: "payment_connected",
      weight: 3,
      sectionId: "payment",
      status: paymentConnected ? "ok" : "missing",
    },
    {
      id: "commissions",
      weight: 3,
      sectionId: "finance",
      status: hasText(values.hotel_commission) && hasText(values.therapist_commission) ? "ok" : "missing",
    },
    {
      id: "payment_mode",
      weight: 2,
      sectionId: "booking-settings",
      status: hasText(values.client_payment_mode) ? "ok" : "missing",
    },
    {
      id: "out_of_hours_surcharge",
      weight: 2,
      sectionId: "booking-settings",
      // Only relevant when out-of-hours bookings are allowed; otherwise N/A.
      status: !values.allow_out_of_hours_booking
        ? "na"
        : toNumber(values.out_of_hours_surcharge_percent) > 0
          ? "ok"
          : "missing",
    },
    {
      id: "deployment",
      weight: 2,
      sectionId: "schedule",
      status: hasDeploymentSchedule ? "ok" : "missing",
    },
    {
      id: "hold",
      weight: 1,
      sectionId: "booking-rules",
      // When the hold is enabled, a valid duration must be set; disabled is fine.
      status: !values.booking_hold_enabled
        ? "ok"
        : toNumber(values.booking_hold_duration_minutes) >= 1 &&
            toNumber(values.booking_hold_duration_minutes) <= 15
          ? "ok"
          : "missing",
    },
    {
      id: "min_notice",
      weight: 1,
      sectionId: "booking-settings",
      status: values.min_booking_notice_minutes != null ? "ok" : "missing",
    },
  ];

  const scored = items.filter((i) => i.status !== "na");
  const totalWeight = scored.reduce((sum, i) => sum + i.weight, 0);
  const okWeight = scored
    .filter((i) => i.status === "ok")
    .reduce((sum, i) => sum + i.weight, 0);

  const percent = totalWeight === 0 ? 100 : Math.round((okWeight / totalWeight) * 100);

  return { percent, items };
}
