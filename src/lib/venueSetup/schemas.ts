/**
 * UX validation of the venue setup wizard (required fields, cross-field rules).
 * The server whitelist lives in @shared/venueSetup/spec; rules here mirror the
 * admin venue form (src/pages/admin/VenueDetail.tsx).
 *
 * Messages are i18n keys of the `setup` namespace.
 */
import { z } from "zod";
import {
  AMENITY_TYPES,
  CLIENT_PAYMENT_MODES,
  INVOICE_CLIENTS,
  PAYMENT_PROVIDERS,
  PMS_TYPES,
  ROOM_CAPABILITY_VALUES,
  SCHEDULE_TYPES,
  VENUE_ROLES,
  VENUE_TYPES,
} from "@shared/venueSetup/spec";

const optText = z.string().trim().optional().or(z.literal(""));
const reqText = z.string().trim().min(1, "errors.required");
const optEmail = z.string().trim().email("errors.email").optional().or(z.literal(""));
const optNum = (min: number, max: number) =>
  z.number().min(min, "errors.range").max(max, "errors.range").nullable().optional();
const optTime = z.string().regex(/^\d{2}:\d{2}$/, "errors.time").optional().or(z.literal(""));
const optDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "errors.date").optional().or(z.literal(""));
const optPath = z.string().nullable().optional();

export const companySchema = z.object({
  organization: z.object({
    commercial_name: reqText,
    legal_name: optText,
    legal_form: optText,
    legal_capital: optText,
    siren: z.string().trim().regex(/^\d{9}$/, "errors.siren").optional().or(z.literal("")),
    siret: z.string().trim().regex(/^\d{14}$/, "errors.siret").optional().or(z.literal("")),
    rcs: optText,
    vat_number: optText,
    legal_address: optText,
    legal_postal_code: optText,
    legal_city: optText,
    legal_country: optText,
    contact_email: optEmail,
    logo_path: optPath,
  }),
  organization_billing_profile: z.object({
    billing_address: optText,
    billing_postal_code: optText,
    billing_city: optText,
    billing_country: optText,
    contact_email: optEmail,
    contact_phone: optText,
  }),
});

export const venueSchema = z.object({
  hotel: z.object({
    name: reqText,
    name_en: optText,
    venue_type: z.enum(VENUE_TYPES, { errorMap: () => ({ message: "errors.required" }) }),
    landing_subtitle: optText,
    landing_subtitle_en: optText,
    description: optText,
    description_en: optText,
    website_url: optText,
    contact_email: optEmail,
    address: reqText,
    postal_code: optText,
    city: reqText,
    country: reqText,
    timezone: optText,
    access_instructions: optText,
    access_instructions_en: optText,
  }),
});

const blockedSlotSchema = z
  .object({
    label: reqText,
    start_time: z.string().regex(/^\d{2}:\d{2}$/, "errors.time"),
    end_time: z.string().regex(/^\d{2}:\d{2}$/, "errors.time"),
    days_of_week: z.array(z.number()).optional(),
    block_date: optDate,
  })
  .refine((s) => s.end_time > s.start_time, { message: "errors.endAfterStart", path: ["end_time"] })
  .refine((s) => (s.days_of_week?.length ?? 0) > 0 || !!s.block_date, {
    message: "errors.daysOrDate",
    path: ["days_of_week"],
  });

export const hoursSchema = z
  .object({
    hotel: z.object({ opening_time: optTime, closing_time: optTime }),
    venue_deployment_schedule: z.object({
      schedule_type: z.enum(SCHEDULE_TYPES),
      days_of_week: z.array(z.number()).optional(),
      recurring_start_date: optDate,
      recurring_end_date: optDate,
    }),
    venue_blocked_slots: z.array(blockedSlotSchema),
  })
  .refine(
    (v) => !v.hotel.opening_time || !v.hotel.closing_time || v.hotel.closing_time > v.hotel.opening_time,
    { message: "errors.closingAfterOpening", path: ["hotel", "closing_time"] },
  )
  .refine(
    (v) =>
      v.venue_deployment_schedule.schedule_type !== "specific_days" ||
      (v.venue_deployment_schedule.days_of_week?.length ?? 0) > 0,
    { message: "errors.pickDays", path: ["venue_deployment_schedule", "days_of_week"] },
  );

export const roomsSchema = z.object({
  treatment_rooms: z.array(
    z.object({
      name: reqText,
      capabilities: z.array(z.enum(ROOM_CAPABILITY_VALUES)).min(1, "errors.pickOne"),
      capacity: z.number({ invalid_type_error: "errors.required" }).int().min(1, "errors.range").max(10, "errors.range"),
    }),
  ),
});

export const amenitiesSchema = z.object({
  venue_amenities: z.array(
    z.object({
      enabled: z.boolean(),
      type: z.enum(AMENITY_TYPES),
      capacity_per_slot: optNum(1, 200),
      slot_duration: optNum(15, 480),
      is_exclusive: z.boolean(),
      prep_time: optNum(0, 240),
      price_external: optNum(0, 10000),
      lymfea_access_included: z.boolean(),
      lymfea_access_duration: optNum(0, 480),
      opening_time: optTime,
      closing_time: optTime,
    }),
  ),
});

export const bookingSchema = z.object({
  hotel: z.object({
    min_booking_notice_minutes: optNum(0, 10080),
    auto_validate_bookings: z.boolean(),
    client_payment_mode: z.enum(CLIENT_PAYMENT_MODES),
    allow_out_of_hours_booking: z.boolean(),
    out_of_hours_surcharge_percent: optNum(0, 100),
    room_turnover_buffer_minutes: optNum(0, 120),
    slot_interval: optNum(5, 120),
    client_cancellation_cutoff_hours: optNum(0, 168),
    client_reschedule_cutoff_hours: optNum(0, 168),
    cancellation_policy_text_fr: optText,
    cancellation_policy_text_en: optText,
  }),
  // At the root: CancellationTiersEditor binds to `cancellation_tiers`.
  cancellation_tiers: z.array(
    z
      .object({
        max_hours: z.number().int().min(0),
        min_hours: z.number().int().min(0),
        refund_percent: z.number().int().min(0).max(100),
      })
      .refine((t) => t.max_hours > t.min_hours, { message: "errors.tierRange", path: ["max_hours"] }),
  ),
});

const venueBillingSchema = z.object({
  company_name: optText,
  siret: z.string().trim().regex(/^\d{14}$/, "errors.siret").optional().or(z.literal("")),
  tva_number: optText,
  billing_address: optText,
  billing_postal_code: optText,
  billing_city: optText,
  billing_country: optText,
  contact_email: optEmail,
});

export const financeSchema = z
  .object({
    hotel: z.object({
      currency: optText,
      vat: optNum(0, 100),
      hotel_commission: optNum(0, 100),
      therapist_commission: optNum(0, 100),
      invoice_client: z.enum(INVOICE_CLIENTS),
    }),
    has_venue_billing_profile: z.boolean(),
    venue_billing_profile: venueBillingSchema,
  })
  .refine(
    (v) => (v.hotel.hotel_commission ?? 0) + (v.hotel.therapist_commission ?? 0) <= 100,
    { message: "errors.commissionSum", path: ["hotel", "therapist_commission"] },
  );

export const paymentSchema = z.object({
  payment: z.object({
    provider: z.enum(PAYMENT_PROVIDERS),
    has_account: z.boolean(),
    account_owner_email: optEmail,
    contact: optText,
  }),
});

export const pmsSchema = z.object({
  hotel: z.object({
    pms_type: z.enum(PMS_TYPES),
    pms_auto_charge_room: z.boolean(),
    pms_guest_lookup_enabled: z.boolean(),
  }),
  pms_contact: z.object({ name: optText, email: optEmail, phone: optText }),
});

export const teamSchema = z.object({
  concierges: z.array(
    z.object({
      first_name: reqText,
      last_name: reqText,
      email: z.string().trim().email("errors.email"),
      phone: reqText,
      country_code: reqText,
      venue_role: z.enum(VENUE_ROLES).or(z.literal("")).optional(),
    }),
  ),
});

const optColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "errors.color").optional().or(z.literal(""));

export const brandingSchema = z.object({
  hotel: z.object({ image_path: optPath, cover_image_path: optPath }),
  venue_branding: z.object({
    button_color: optColor,
    button_text_color: optColor,
    welcome_background_color: optColor,
    font_title_family: optText,
    font_title_path: optPath,
    font_body_family: optText,
    font_body_path: optPath,
  }),
  notes: optText,
});

/** Parses number inputs: empty → null (saved as "no answer"). */
export const toNumOrNull = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));
